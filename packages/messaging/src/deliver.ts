import logger from "@shopkeeper/agent/logger"
import { recordManualMerchantReplyForThread } from "@shopkeeper/agent/request-outcome"
import { THREAD_STATUS } from "@shopkeeper/agent/thread-constants"
import { db, SenderType } from "@shopkeeper/db"
import type { MessagingHost } from "./host.js"
import { dispatchInstagramDirect } from "./instagram.js"
import {
  createPendingLogicalResponse,
  createSentAgentMessage,
  markAgentMessageSendFailed,
  markLogicalResponseAttempted,
  markLogicalResponseSent,
  markPendingAgentMessageSendUnknown,
} from "./message-rows.js"
import type {
  DispatchFailure,
  DispatchMessageOptions,
  DispatchMessageResult,
  DispatchOrg,
  DispatchProviderResult,
  DispatchThread,
} from "./types.js"

// Refuse before the provider is touched. A draft or approval written against an
// episode that has since rolled over describes a conversation the customer has
// moved past, so it is neither sent to the old thread nor quietly rerouted onto
// the new one — rerouting would put model-authored text into a conversation it
// was not written for.
export async function assertCurrentEpisode(thread: DispatchThread): Promise<DispatchFailure | null> {
  const current = await db.thread.findUnique({
    where: { id: thread.id },
    select: { status: true, closedReason: true },
  })
  if (current?.status === THREAD_STATUS.CLOSED && current.closedReason === "episode_rollover") {
    return {
      ok: false,
      code: "episode_superseded",
      error: "This conversation has ended and the shopper has started a new one",
    }
  }
  return null
}

/**
 * Tells a messaging-channel customer that a person is looking at their message.
 * It is delivered like a reply but recorded as an internal note: it answers
 * nothing, so the thread must keep awaiting a real reply and the plan the merchant
 * is reviewing must stay current — an outbound message would end both.
 *
 * Once per wait: the note is keyed to the latest real reply, which an
 * acknowledgement never moves, so a customer who writes again before anyone
 * answers is not told the same thing twice. The key is claimed before the send
 * and released if the provider definitely refuses it.
 *
 * `send` is the channel's provider call; null when the channel has none.
 */
export async function dispatchAcknowledgement(
  thread: DispatchThread,
  text: string,
  send: (() => Promise<DispatchProviderResult>) | null,
): Promise<DispatchFailure | { ok: true; skipped: boolean }> {
  const superseded = await assertCurrentEpisode(thread)
  if (superseded) return superseded
  if (!send) return { ok: false, error: "Unsupported channel" }

  const lastReply = await db.message.findFirst({
    where: {
      organizationId: thread.organizationId,
      threadId: thread.id,
      senderType: { in: [SenderType.agent, SenderType.ai] },
      deletedAt: null,
    },
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
    select: { id: true },
  })
  const key = `handoff-ack:${thread.id}:${lastReply?.id ?? "start"}`
  const claimed = await db.message.createMany({
    data: {
      threadId: thread.id,
      organizationId: thread.organizationId,
      senderType: SenderType.note,
      externalMessageId: key,
      contentText: `Sent automatically to the customer: "${text}"`,
    },
    skipDuplicates: true,
  })
  if (claimed.count === 0) return { ok: true, skipped: true }

  const providerResult = await send()
  // An unknown outcome may have reached the customer, so it keeps the claim.
  if (!providerResult.ok && providerResult.outcome !== "unknown") {
    await db.message.deleteMany({ where: { organizationId: thread.organizationId, externalMessageId: key } })
  }
  return providerResult.ok ? { ok: true, skipped: false } : providerResult
}

/**
 * Sends text through `send`, the channel's provider call, and records it on the
 * thread. An agent reply is persisted as pending and marked attempted before the
 * provider is called, so a crash mid-send leaves a row that says so; any other
 * send is recorded once the provider has accepted it.
 *
 * The caller has already refused a superseded episode.
 */
export async function deliverMessage(
  thread: DispatchThread,
  text: string,
  options: DispatchMessageOptions,
  send: () => Promise<DispatchProviderResult>,
  host: MessagingHost,
): Promise<DispatchMessageResult> {
  const source = options.source ?? "dispatch_message"
  const attachments = options.attachments ?? []
  const attribution = { agentRequestId: options.agentRequestId, agentTaskId: options.agentTaskId }

  const pendingResponse = source === "agent_send_reply"
    ? await createPendingLogicalResponse(thread, text, attachments, attribution)
    : null

  if (pendingResponse) await markLogicalResponseAttempted(pendingResponse.id)

  const providerResult = await send()

  if (!providerResult.ok) {
    if (!pendingResponse) return providerResult
    if (providerResult.outcome === "unknown") {
      await markPendingAgentMessageSendUnknown(pendingResponse.id, providerResult.error)
    } else {
      await markAgentMessageSendFailed(pendingResponse.id, providerResult.error)
    }
    return { ...providerResult, message: { ...pendingResponse, sendStatus: providerResult.outcome === "unknown" ? "unknown" : "failed" } }
  }

  const message = pendingResponse
    ? await markLogicalResponseSent(
        pendingResponse.id,
        providerResult.integrationId,
        providerResult.providerMessageId,
      )
    : await createSentAgentMessage(
        thread,
        text,
        providerResult.integrationId,
        providerResult.providerMessageId,
        attachments,
        attribution,
      )
  const replySource = options.analyticsReplySource
    ?? (source === "agent_send_reply" ? "agent_approved" : "manual")
  if (replySource === "manual" && source !== "auto_ack") {
    void recordManualMerchantReplyForThread({
      orgId: thread.organizationId,
      threadId: thread.id,
      outgoingMessageId: message.id,
    }).catch((err) => {
      logger.error(
        { err, threadId: thread.id, organizationId: thread.organizationId },
        "[dispatch-message] Failed to record manual reply outcome",
      );
    });
  }
  void host.captureReplySent({
    channel: thread.channelType,
    messageId: message.id,
    organizationId: thread.organizationId,
    replySource,
  })
  return { ok: true, message }
}

/** Sends text on an Instagram thread from whichever app holds the work. */
export async function dispatchInstagramMessage(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
  options: DispatchMessageOptions,
  host: MessagingHost,
): Promise<DispatchMessageResult> {
  const superseded = await assertCurrentEpisode(thread)
  if (superseded) return superseded
  return deliverMessage(
    thread,
    text,
    options,
    () => dispatchInstagramDirect(thread, org, text, options.source ?? "dispatch_message", host),
    host,
  )
}
