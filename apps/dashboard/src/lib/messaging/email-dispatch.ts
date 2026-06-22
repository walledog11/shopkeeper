import { db, SenderType } from "@shopkeeper/db"
import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import { getEmailProvider } from "@shopkeeper/email/providers"
import { buildThreadReplyHeaders, formatReplySubject } from "@shopkeeper/email/reply"
import { getEmailSender } from "@shopkeeper/email/senders"
import { EmailNotConfiguredError } from "@shopkeeper/email/types"
import logger from "@/lib/server/logger"
import { recordOutboundCall } from "@/lib/server/outbound-recorder"
import { recordEmailSendFailure } from "@/lib/messaging/provider-send-failures"
import { enqueueOutboundEmail } from "@/lib/messaging/enqueue-outbound-email"
import {
  createPendingAgentMessage,
  markAgentMessageSendFailed,
} from "./dispatch-message-common"
import type {
  DispatchFailure,
  DispatchOrg,
  DispatchProviderResult,
  DispatchSource,
  DispatchThread,
  DispatchMessageResult,
} from "./dispatch-message-types"

// Dashboard records the pending message, then hands provider delivery to the
// gateway queue. The gateway worker owns retry/backoff and final sendStatus.
export async function dispatchEmailViaGatewayQueue(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
  source: DispatchSource,
): Promise<DispatchMessageResult> {
  const integration = await db.integration.findFirst({
    where: { organizationId: org.id, platform: CHANNEL_TYPE.EMAIL },
  })
  if (!integration) return { ok: false, error: "No email integration configured" }

  const message = await createPendingAgentMessage(thread, text)

  const enqueued = await enqueueOutboundEmail({
    organizationId: org.id,
    messageId: message.id,
    threadId: thread.id,
    integrationId: integration.id,
    source,
  })

  if (!enqueued) {
    await markAgentMessageSendFailed(message.id, "Could not queue email send")
    return { ok: false, error: "Could not queue email send" }
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
  const integration = await db.integration.findFirst({
    where: { organizationId: org.id, platform: CHANNEL_TYPE.EMAIL },
  })
  if (!integration) return { ok: false, error: "No email integration configured" }

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
  if (recorded) return { ok: true }

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

  return { ok: true }
}

export type { DispatchFailure }
