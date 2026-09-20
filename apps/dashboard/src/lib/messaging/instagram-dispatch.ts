import { db, SenderType } from "@shopkeeper/db"
import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import {
  hasVerifiedInstagramMessagingPermission,
  INSTAGRAM_REQUIRED_SCOPES,
  instagramReconnectRequiredByHealth,
  isLegacyInstagramMetadata,
  isSocialApiMetadata,
  readInstagramMetadata,
  readSocialApiAccountId,
  sendInstagramTextMessage,
  type InstagramProviderError,
} from "@shopkeeper/integrations/instagram"
import { createSocialApiClient } from "@shopkeeper/integrations/socialapi"
import logger from "@/lib/server/logger"
import { recordOutboundCall } from "@/lib/server/outbound-recorder"
import { recordInstagramSendFailure } from "@/lib/messaging/provider-send-failures"
import type {
  DispatchOrg,
  DispatchProviderResult,
  DispatchSource,
  DispatchThread,
} from "./dispatch-message-types"

const INSTAGRAM_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000
const OUTSIDE_REPLY_WINDOW =
  "Instagram only allows replies within 24 hours of the customer's last message"
const DISCONNECTED_CONVERSATION = "This Instagram conversation is no longer connected"
const LEGACY_CONVERSATION = "This legacy Instagram conversation is read-only"
const EXPIRED_CONNECTION = "Instagram connection expired — reconnect Instagram to reply"
const MISSING_PERMISSION = "Instagram messaging permission is missing — reconnect Instagram"
const SOCIALAPI_UNCONFIGURED = "Instagram replies are not configured — contact support"
const SOCIALAPI_NO_CONVERSATION = "This Instagram conversation cannot be replied to yet"


function mapInstagramProviderError(error: InstagramProviderError): {
  detail: string
  error: string
} {
  if (error.code === 10 && error.subcode === 2018278) {
    return {
      detail: "Outside Instagram 24-hour messaging window",
      error: OUTSIDE_REPLY_WINDOW,
    }
  }
  if (error.category === "authentication") {
    return { detail: "Instagram token expired or revoked", error: EXPIRED_CONNECTION }
  }
  if (error.category === "permission") {
    return { detail: "Instagram messaging permission missing", error: MISSING_PERMISSION }
  }
  if (error.category === "rate_limit") {
    return {
      detail: "Instagram rate limit exceeded",
      error: "Instagram is rate limiting replies — try again later",
    }
  }
  if (error.category === "transient_provider_failure") {
    return {
      detail: "Instagram provider temporarily unavailable",
      error: "Instagram is temporarily unavailable — try again later",
    }
  }
  if (error.category === "validation") {
    return { detail: "Instagram rejected the message as invalid", error: error.message }
  }
  return { detail: "Instagram provider returned an unknown error", error: "Failed to send via Instagram" }
}

/**
 * SocialAPI outbound. It shares Shopkeeper's 24-hour window check, reply-integration
 * routing, and outbound-call recording with the direct Meta path above, and differs
 * in what it addresses: a provider conversation rather than a recipient IGSID, with a
 * workspace API key rather than the integration's own Meta token. A failure here is
 * never retried through Meta — a SocialAPI merchant has not authorized Shopkeeper's
 * Meta app, so the two transports are not interchangeable.
 */
async function sendThroughSocialApi(input: {
  accountId: string
  conversationId: string
  integrationId: string
  organizationId: string
  text: string
  threadId: string
}): Promise<DispatchProviderResult> {
  const apiKey = process.env.SOCIALAPI_API_KEY?.trim()
  if (!apiKey) {
    await recordFailure({
      detail: "SOCIALAPI_API_KEY is not configured",
      integrationId: input.integrationId,
      organizationId: input.organizationId,
      threadId: input.threadId,
      transport: "socialapi",
    })
    return { ok: false, error: SOCIALAPI_UNCONFIGURED }
  }

  const result = await createSocialApiClient({ apiKey }).sendInstagramText({
    accountId: input.accountId,
    conversationId: input.conversationId,
    text: input.text,
  })
  if (!result.ok) {
    logger.error(
      {
        category: result.error.category,
        httpStatus: result.error.httpStatus,
        integrationId: input.integrationId,
        requestId: result.error.requestId,
        threadId: input.threadId,
      },
      "[dispatchMessage] SocialAPI send failed",
    )
    await recordFailure({
      detail: `SocialAPI send failed (${result.error.category})`,
      integrationId: input.integrationId,
      organizationId: input.organizationId,
      threadId: input.threadId,
      transport: "socialapi",
    })
    return {
      ok: false,
      error: "Failed to send via Instagram",
      ...(result.error.httpStatus > 0 && { providerStatus: result.error.httpStatus }),
    }
  }

  logger.info(
    { integrationId: input.integrationId, threadId: input.threadId },
    "[dispatchMessage] SocialAPI reply accepted",
  )
  return {
    ok: true,
    integrationId: input.integrationId,
    providerMessageId: result.data.messageId,
  }
}

async function recordFailure(input: {
  detail: string
  integrationId: string | null
  organizationId: string
  threadId: string
  transport?: "meta" | "socialapi"
}): Promise<void> {
  try {
    await recordInstagramSendFailure(input)
  } catch (error) {
    logger.error(
      { err: error, integrationId: input.integrationId, threadId: input.threadId },
      "[dispatchMessage] Failed to record Instagram send failure",
    )
  }
}

export async function dispatchInstagramDirect(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
  source: DispatchSource,
): Promise<DispatchProviderResult> {
  const recipientId = thread.customer.platformId
  const threadRoute = await db.thread.findFirst({
    where: {
      id: thread.id,
      organizationId: org.id,
      channelType: CHANNEL_TYPE.IG_DM,
    },
    select: {
      externalSpaceId: true,
      replyIntegrationId: true,
      messages: {
        where: { senderType: SenderType.customer },
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { sentAt: true },
      },
    },
  })

  if (!threadRoute?.replyIntegrationId) {
    await recordFailure({
      detail: "Instagram thread has no reply integration",
      integrationId: null,
      organizationId: org.id,
      threadId: thread.id,
    })
    return { ok: false, error: DISCONNECTED_CONVERSATION }
  }

  const igIntegration = await db.integration.findFirst({
    where: {
      id: threadRoute.replyIntegrationId,
      organizationId: org.id,
      platform: CHANNEL_TYPE.IG_DM,
      lifecycleStatus: 'active',
    },
    select: {
      accessToken: true,
      externalAccountId: true,
      id: true,
      metadata: true,
      tokenExpiresAt: true,
    },
  })

  if (!igIntegration) {
    await recordFailure({
      detail: "Instagram reply integration was disconnected or replaced",
      integrationId: threadRoute.replyIntegrationId,
      organizationId: org.id,
      threadId: thread.id,
    })
    return { ok: false, error: DISCONNECTED_CONVERSATION }
  }

  const metadata = readInstagramMetadata(igIntegration.metadata)
  const isSocialApi = isSocialApiMetadata(igIntegration.metadata)
  if (!isSocialApi && isLegacyInstagramMetadata(igIntegration.metadata)) {
    await recordFailure({
      detail: "Legacy Instagram integration cannot send replies",
      integrationId: igIntegration.id,
      organizationId: org.id,
      threadId: thread.id,
    })
    return { ok: false, error: LEGACY_CONVERSATION }
  }

  const healthReconnect = isSocialApi || !metadata
    ? null
    : instagramReconnectRequiredByHealth(metadata)
  if (healthReconnect) {
    const permissionFailure = healthReconnect === "permission"
    await recordFailure({
      detail: permissionFailure
        ? "Instagram health check found missing messaging access"
        : "Instagram health check requires reconnect",
      integrationId: igIntegration.id,
      organizationId: org.id,
      threadId: thread.id,
    })
    return { ok: false, error: permissionFailure ? MISSING_PERMISSION : EXPIRED_CONNECTION }
  }

  if (!isSocialApi && metadata && !hasVerifiedInstagramMessagingPermission(metadata, INSTAGRAM_REQUIRED_SCOPES)) {
    await recordFailure({
      detail: "Instagram messaging permission missing",
      integrationId: igIntegration.id,
      organizationId: org.id,
      threadId: thread.id,
    })
    return { ok: false, error: MISSING_PERMISSION }
  }

  const igToken = igIntegration.accessToken
  if (
    !isSocialApi
    && (
      !igToken
      || !igIntegration.tokenExpiresAt
      || igIntegration.tokenExpiresAt.getTime() <= Date.now()
    )
  ) {
    await recordFailure({
      detail: "Instagram token expired or missing",
      integrationId: igIntegration.id,
      organizationId: org.id,
      threadId: thread.id,
    })
    return { ok: false, error: EXPIRED_CONNECTION }
  }

  const lastCustomerMessageAt = threadRoute.messages[0]?.sentAt
  if (!lastCustomerMessageAt) {
    await recordFailure({
      detail: "Instagram thread has no inbound customer message",
      integrationId: igIntegration.id,
      organizationId: org.id,
      threadId: thread.id,
    })
    return {
      ok: false,
      error: "Instagram replies require the customer to message the account first",
    }
  }
  if (Date.now() - lastCustomerMessageAt.getTime() >= INSTAGRAM_REPLY_WINDOW_MS) {
    await recordFailure({
      detail: "Outside Instagram 24-hour messaging window",
      integrationId: igIntegration.id,
      organizationId: org.id,
      threadId: thread.id,
    })
    return { ok: false, error: OUTSIDE_REPLY_WINDOW }
  }

  const providerAccountId = isSocialApi && metadata ? readSocialApiAccountId(metadata) : null
  const conversationId = threadRoute.externalSpaceId
  if (isSocialApi && (!providerAccountId || !conversationId)) {
    await recordFailure({
      detail: providerAccountId
        ? "SocialAPI thread has no provider conversation id"
        : "SocialAPI integration has no provider account id",
      integrationId: igIntegration.id,
      organizationId: org.id,
      threadId: thread.id,
      transport: "socialapi",
    })
    return { ok: false, error: SOCIALAPI_NO_CONVERSATION }
  }

  const recorded = await recordOutboundCall({
    source,
    provider: isSocialApi ? "socialapi" : "meta",
    channel: "ig_dm",
    organizationId: org.id,
    threadId: thread.id,
    to: recipientId,
    from: igIntegration.externalAccountId,
    text,
    metadata: {
      igAccountId: igIntegration.externalAccountId,
      integrationId: igIntegration.id,
    },
  })
  if (recorded) return { ok: true, integrationId: igIntegration.id }

  if (isSocialApi) {
    return sendThroughSocialApi({
      accountId: providerAccountId!,
      conversationId: conversationId!,
      integrationId: igIntegration.id,
      organizationId: org.id,
      text,
      threadId: thread.id,
    })
  }

  const result = await sendInstagramTextMessage({
    accessToken: igToken!,
    accountId: igIntegration.externalAccountId,
    recipientIgsid: recipientId,
    text,
  })
  if (!result.ok) {
    const mapped = mapInstagramProviderError(result.error)
    logger.error(
      {
        category: result.error.category,
        code: result.error.code,
        httpStatus: result.error.httpStatus,
        integrationId: igIntegration.id,
        requestId: result.error.requestId,
        subcode: result.error.subcode,
        threadId: thread.id,
      },
      "[dispatchMessage] Instagram API failed",
    )
    await recordFailure({
      detail: mapped.detail,
      integrationId: igIntegration.id,
      organizationId: org.id,
      threadId: thread.id,
    })
    return {
      ok: false,
      error: mapped.error,
      ...(result.error.httpStatus > 0 && { providerStatus: result.error.httpStatus }),
    }
  }

  logger.info(
    {
      accountId: igIntegration.externalAccountId,
      integrationId: igIntegration.id,
      messageId: result.data.messageId,
      recipientId: result.data.recipientId,
      requestId: result.requestId,
      threadId: thread.id,
    },
    "[dispatchMessage] Instagram reply accepted",
  )
  return {
    ok: true,
    integrationId: igIntegration.id,
    providerMessageId: result.data.messageId,
    providerRecipientId: result.data.recipientId,
  }
}
