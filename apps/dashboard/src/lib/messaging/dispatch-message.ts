import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import { db } from "@shopkeeper/db"
import { isOutboundEmailAsyncEnabled } from "@/lib/messaging/enqueue-outbound-email"
import { createSentAgentMessage } from "./dispatch-message-common"
import {
  dispatchEmailViaGatewayQueue,
  sendEmailSynchronously,
} from "./email-dispatch"
import { dispatchInstagramDirect } from "./instagram-dispatch"
import { dispatchTikTokShopMessage } from "./tiktok-shop-dispatch"
import type {
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
): Promise<{ ok: true; integrationId: string; providerMessageId: undefined } | { ok: false; error: string }> {
  const session = await db.storefrontChatSession.findFirst({
    where: { threadId: thread.id, organizationId: thread.organizationId, revokedAt: null },
    select: { integrationId: true },
  })
  if (!session) return { ok: false, error: "Storefront chat session is closed or revoked" }
  return { ok: true, integrationId: session.integrationId, providerMessageId: undefined }
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
  const isEmailChannel =
    thread.channelType === CHANNEL_TYPE.EMAIL || thread.channelType === CHANNEL_TYPE.SHOPIFY

  if (isEmailChannel && isOutboundEmailAsyncEnabled()) {
    return dispatchEmailViaGatewayQueue(
      thread,
      org,
      text,
      source,
      options.analyticsReplySource,
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
      })
      : thread.channelType === CHANNEL_TYPE.SHOPIFY
        ? await sendEmailSynchronously(thread, org, text, {
          source,
          subjectFallback: options.emailSubjectFallback,
          originalChannel: CHANNEL_TYPE.SHOPIFY,
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
  )
  void captureDashboardOutboundReplySent({
    channel: thread.channelType,
    messageId: message.id,
    organizationId: org.id,
    replySource: options.analyticsReplySource
      ?? (source === "agent_send_reply" ? "agent_approved" : "manual"),
  })
  return { ok: true, message }
}
