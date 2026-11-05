import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import { db } from "@shopkeeper/db"
import {
  assertCurrentEpisode,
  deliverMessage,
  dispatchAcknowledgement as acknowledgeOnChannel,
  dispatchInstagramDirect,
  type DispatchFailure,
  type DispatchMessageOptions,
  type DispatchMessageResult,
  type DispatchOrg,
  type DispatchProviderResult,
  type DispatchSource,
  type DispatchThread,
} from "@shopkeeper/messaging"
import { isOutboundEmailAsyncEnabled } from "@/lib/messaging/enqueue-outbound-email"
import {
  dispatchEmailViaGatewayQueue,
  sendEmailSynchronously,
} from "./email-dispatch"
import { dashboardMessagingHost } from "./messaging-host"
import { dispatchTikTokShopMessage } from "./tiktok-shop-dispatch"
import { isStorefrontChatGloballyEnabled, isStorefrontChatEnabledForIntegration } from "@/lib/storefront-chat/enabled"

export type { DispatchMessageResult } from "@shopkeeper/messaging"

// Storefront chat has no outbound provider: the widget polls for new messages,
// so "delivery" is persisting the row that createSentAgentMessage writes next.
// Resolving the session still matters — it binds the message to the right
// integration and refuses to persist a reply into a revoked session, which
// would otherwise look delivered to the merchant and reach nobody.
async function resolveStorefrontChatDelivery(
  thread: DispatchThread,
): Promise<{ ok: true; integrationId: string; providerMessageId: undefined } | DispatchFailure> {
  if (!isStorefrontChatGloballyEnabled()) return { ok: false, error: "Storefront chat is disabled" }
  const session = await db.storefrontChatSession.findFirst({
    where: {
      threadId: thread.id, organizationId: thread.organizationId, revokedAt: null,
      expiresAt: { gt: new Date() },
      organization: { lifecycleStatus: "active" }, integration: { lifecycleStatus: "active" },
    },
    select: { integrationId: true, integration: { select: { metadata: true } } },
  })
  if (session && isStorefrontChatEnabledForIntegration(session.integration.metadata)) {
    return { ok: true, integrationId: session.integrationId, providerMessageId: undefined }
  }
  // A live session that has moved on to a later episode is a different failure
  // from a revoked one, and the merchant should be told which. The widget is
  // showing the current episode, so persisting here would deliver to nobody.
  const supersededFor = await db.storefrontChatSessionEpisode.findFirst({
    where: {
      threadId: thread.id,
      organizationId: thread.organizationId,
      session: { revokedAt: null, expiresAt: { gt: new Date() }, threadId: { not: thread.id } },
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
  return { ok: false, error: "Storefront chat session is closed, expired, or disabled" }
}

/**
 * Tells a messaging-channel customer that a person is looking at their message.
 * Once per wait; see `dispatchAcknowledgement` in `@shopkeeper/messaging`.
 */
export function dispatchAcknowledgement(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
): Promise<DispatchFailure | { ok: true; skipped: boolean }> {
  return acknowledgeOnChannel(
    thread,
    text,
    thread.channelType === CHANNEL_TYPE.IG_DM
      ? () => dispatchInstagramDirect(thread, org, text, "auto_ack", dashboardMessagingHost)
      : thread.channelType === CHANNEL_TYPE.TIKTOK
        ? () => dispatchTikTokShopMessage(thread, org, text, "auto_ack")
        : null,
  )
}

function sendOnChannel(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
  source: DispatchSource,
  options: DispatchMessageOptions,
): Promise<DispatchProviderResult> {
  const attachments = options.attachments ?? []
  switch (thread.channelType) {
    case CHANNEL_TYPE.IG_DM:
      return dispatchInstagramDirect(thread, org, text, source, dashboardMessagingHost)
    case CHANNEL_TYPE.TIKTOK:
      return dispatchTikTokShopMessage(thread, org, text, source)
    case CHANNEL_TYPE.EMAIL:
      return sendEmailSynchronously(thread, org, text, {
        source,
        subjectFallback: options.emailSubjectFallback,
        attachments,
      })
    case CHANNEL_TYPE.SHOPIFY:
      return sendEmailSynchronously(thread, org, text, {
        source,
        subjectFallback: options.emailSubjectFallback,
        originalChannel: CHANNEL_TYPE.SHOPIFY,
        attachments,
      })
    case CHANNEL_TYPE.SHOPIFY_CHAT:
      return resolveStorefrontChatDelivery(thread)
    default:
      return Promise.resolve({ ok: false as const, error: "Unsupported channel" })
  }
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
      { agentRequestId: options.agentRequestId, agentTaskId: options.agentTaskId },
    )
  }

  return deliverMessage(
    thread,
    text,
    options,
    () => sendOnChannel(thread, org, text, source, options),
    dashboardMessagingHost,
  )
}
