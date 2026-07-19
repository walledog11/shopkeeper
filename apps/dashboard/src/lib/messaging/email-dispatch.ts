import { db, SenderType } from "@shopkeeper/db"
import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import { getEmailProvider } from "@shopkeeper/email/providers"
import { buildThreadReplyHeaders, formatReplySubject } from "@shopkeeper/email/reply"
import { getEmailSender } from "@shopkeeper/email/senders"
import { EmailNotConfiguredError } from "@shopkeeper/email/types"
import { resolveEmailIntegration } from "@shopkeeper/email/integration-resolution"
import logger from "@/lib/server/logger"
import { recordOutboundCall } from "@/lib/server/outbound-recorder"
import { recordEmailSendFailure } from "@/lib/messaging/provider-send-failures"
import { enqueueOutboundEmail } from "@/lib/messaging/enqueue-outbound-email"
import {
  createPendingAgentMessage,
  markAgentMessageSendFailed,
  markPendingAgentMessageSendUnknown,
} from "./dispatch-message-common"
import type {
  DispatchFailure,
  DispatchOrg,
  DispatchProviderResult,
  DispatchSource,
  DispatchThread,
  DispatchMessageResult,
} from "./dispatch-message-types"
import type { ReplySource } from "@shopkeeper/analytics"

// Dashboard records the pending message, then hands provider delivery to the
// gateway queue. The gateway worker owns retry/backoff and final sendStatus.
export async function dispatchEmailViaGatewayQueue(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
  source: DispatchSource,
  replySource?: ReplySource,
): Promise<DispatchMessageResult> {
  let integration
  try {
    integration = await resolveEmailIntegration({
      organizationId: org.id,
      purpose: thread.channelType === CHANNEL_TYPE.EMAIL ? "reply" : "proactive",
      threadId: thread.channelType === CHANNEL_TYPE.EMAIL ? thread.id : null,
    })
  } catch (error) {
    if (error instanceof EmailNotConfiguredError) {
      return { ok: false, error: "Email not configured", detail: error.message }
    }
    throw error
  }

  const message = await createPendingAgentMessage(thread, text, integration.id)

  const enqueued = await enqueueOutboundEmail({
    organizationId: org.id,
    messageId: message.id,
    threadId: thread.id,
    integrationId: integration.id,
    ...(replySource ? { replySource } : {}),
    source,
  })

  if (enqueued === "failed") {
    await markAgentMessageSendFailed(message.id, "Could not queue email send")
    return { ok: false, error: "Could not queue email send" }
  }
  if (enqueued === "unknown") {
    await markPendingAgentMessageSendUnknown(message.id, "Email queue admission outcome unknown")
    return { ok: false, error: "Email queue admission could not be confirmed" }
  }

  return { ok: true, message }
}

export async function sendEmailSynchronously(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
  opts: {
    source: DispatchSource
    subjectFallback?: string
    originalChannel?: string
  },
): Promise<DispatchProviderResult> {
  let integration
  try {
    integration = await resolveEmailIntegration({
      organizationId: org.id,
      purpose: thread.channelType === CHANNEL_TYPE.EMAIL ? "reply" : "proactive",
      threadId: thread.channelType === CHANNEL_TYPE.EMAIL ? thread.id : null,
    })
  } catch (error) {
    if (error instanceof EmailNotConfiguredError) {
      return { ok: false, error: "Email not configured", detail: error.message }
    }
    throw error
  }

  const threadCtx = await db.thread.findUnique({
    where: { id: thread.id },
    select: {
      subject: true,
      messages: {
        where: { senderType: SenderType.customer, externalMessageId: { not: null } },
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { externalMessageId: true },
      },
    },
  })

  const fromEmail = integration.fromEmail || integration.externalAccountId
  const subject = formatReplySubject(threadCtx?.subject, opts.subjectFallback)
  const headers = buildThreadReplyHeaders(thread.id, threadCtx?.messages[0]?.externalMessageId)

  const provider = getEmailProvider(integration)
  const recorded = await recordOutboundCall({
    source: opts.source,
    provider,
    channel: "email",
    organizationId: org.id,
    threadId: thread.id,
    to: thread.customer.platformId,
    from: fromEmail,
    subject,
    text,
    headers,
    metadata: {
      replyTo: integration.externalAccountId,
      ...(opts.originalChannel && { originalChannel: opts.originalChannel }),
    },
  })
  if (recorded) return { ok: true, integrationId: integration.id }

  try {
    await getEmailSender(integration).send({
      to: thread.customer.platformId,
      fromAddress: fromEmail,
      fromName: org.name,
      replyTo: integration.externalAccountId,
      subject,
      text,
      headers,
    })
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) {
      return { ok: false, error: "Email not configured", detail: err.message }
    }
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(
      { err: msg, originalChannel: opts.originalChannel },
      "[dispatchMessage] Email send failed",
    )
    await recordEmailSendFailure({
      provider,
      organizationId: org.id,
      threadId: thread.id,
      integrationId: integration.id,
      detail: msg,
      originalChannel: opts.originalChannel,
    })
    return { ok: false, error: "Email dispatch failed", detail: msg }
  }

  return { ok: true, integrationId: integration.id }
}

export type { DispatchFailure }
