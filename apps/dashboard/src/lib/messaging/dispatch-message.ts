import { CHANNEL_TYPE, THREAD_STATUS } from "@shopkeeper/agent/thread-constants"
import { recordManualMerchantReplyForThread } from "@shopkeeper/agent/request-outcome"
import { db } from "@shopkeeper/db"
import logger from "@/lib/server/logger"
import { isOutboundEmailAsyncEnabled } from "@/lib/messaging/enqueue-outbound-email"
import { createSentAgentMessage } from "./dispatch-message-common"
import {
  dispatchEmailViaGatewayQueue,
  sendEmailSynchronously,
} from "./email-dispatch"
import { dispatchInstagramDirect } from "./instagram-dispatch"
import { dispatchTikTokShopMessage } from "./tiktok-shop-dispatch"
import type {
  DispatchFailure,
  DispatchMessageOptions,
  DispatchMessageResult,
  DispatchOrg,
  DispatchThread,
} from "./dispatch-message-types"
import { captureDashboardOutboundReplySent } from "@/lib/server/product-analytics"

export type { DispatchMessageResult } from "./dispatch-message-types"

// Storefront chat has no outbound provider: the widget polls for new messages,
// so "delivery" is persisting the row that createSentAgentMessage writes next.
// Resolving the session still matters — it binds the message to the right
// integration and refuses to persist a reply into a revoked session, which
// would otherwise look delivered to the merchant and reach nobody.
async function resolveStorefrontChatDelivery(
  thread: DispatchThread,
): Promise<{ ok: true; integrationId: string; providerMessageId: undefined } | DispatchFailure> {
  const session = await db.storefrontChatSession.findFirst({
    where: { threadId: thread.id, organizationId: thread.organizationId, revokedAt: null },
    select: { integrationId: true },
  })
  if (session) {
    return { ok: true, integrationId: session.integrationId, providerMessageId: undefined }
  }
  // A live session that has moved on to a later episode is a different failure
  // from a revoked one, and the merchant should be told which. The widget is
  // showing the current episode, so persisting here would deliver to nobody.
  const supersededFor = await db.storefrontChatSessionEpisode.findFirst({
    where: {
      threadId: thread.id,
      organizationId: thread.organizationId,
      session: { revokedAt: null },
    },
    select: { id: true },
  })
  if (supersededFor) {
    return {
      ok: false,
      code: "episode_superseded",
      error: "This conversation has ended and the shopper has started a new one",
    }
  }
  return { ok: false, error: "Storefront chat session is closed or revoked" }
}

// Refuse before the provider is touched. A draft or approval written against an
// episode that has since rolled over describes a conversation the customer has
// moved past, so it is neither sent to the old thread nor quietly rerouted onto
// the new one — rerouting would put model-authored text into a conversation it
// was not written for.
async function assertCurrentEpisode(thread: DispatchThread): Promise<DispatchFailure | null> {
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
 * Dispatches text to the customer via the thread's channel, then saves
 * the message to DB and sets the thread status to open.
 * Returns { ok: true, message } on success, { ok: false, error } on failure.
 *
 * The email async path intentionally hands provider delivery to the gateway
 * queue while preserving this dashboard-facing API.
 */
export async function dispatchMessage(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
  options: DispatchMessageOptions = {},
): Promise<DispatchMessageResult> {
  const source = options.source ?? "dispatch_message"
  const attachments = options.attachments ?? []
  const isEmailChannel =
    thread.channelType === CHANNEL_TYPE.EMAIL || thread.channelType === CHANNEL_TYPE.SHOPIFY

  const superseded = await assertCurrentEpisode(thread)
  if (superseded) return superseded

  // Refuse before the provider rather than dropping the files silently. Only
  // email has an outbound attachment path: Instagram's send client is text-only
  // and Meta fetches media by public URL, storefront chat has no shopper-
  // reachable route to a private blob, and TikTok is gated off.
  if (attachments.length > 0 && !isEmailChannel) {
    return { ok: false, error: "Attachments can only be sent on email conversations" }
  }

  if (isEmailChannel && isOutboundEmailAsyncEnabled()) {
    return dispatchEmailViaGatewayQueue(
      thread,
      org,
      text,
      source,
      options.analyticsReplySource,
      attachments,
    )
  }

  const providerResult = thread.channelType === CHANNEL_TYPE.IG_DM
    ? await dispatchInstagramDirect(thread, org, text, source)
    : thread.channelType === CHANNEL_TYPE.TIKTOK
      ? await dispatchTikTokShopMessage(thread, org, text, source)
    : thread.channelType === CHANNEL_TYPE.EMAIL
      ? await sendEmailSynchronously(thread, org, text, {
        source,
        subjectFallback: options.emailSubjectFallback,
        attachments,
      })
      : thread.channelType === CHANNEL_TYPE.SHOPIFY
        ? await sendEmailSynchronously(thread, org, text, {
          source,
          subjectFallback: options.emailSubjectFallback,
          originalChannel: CHANNEL_TYPE.SHOPIFY,
          attachments,
        })
        : thread.channelType === CHANNEL_TYPE.SHOPIFY_CHAT
          ? await resolveStorefrontChatDelivery(thread)
          : { ok: false as const, error: "Unsupported channel" }

  if (!providerResult.ok) return providerResult

  const message = await createSentAgentMessage(
    thread,
    text,
    providerResult.integrationId,
    providerResult.providerMessageId,
    attachments,
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
  void captureDashboardOutboundReplySent({
    channel: thread.channelType,
    messageId: message.id,
    organizationId: org.id,
    replySource,
  })
  return { ok: true, message }
}
