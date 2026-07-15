import { db, SenderType } from "@shopkeeper/db"
import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import {
  INSTAGRAM_REQUIRED_SCOPES,
  sendInstagramTextMessage,
  type InstagramProviderError,
} from "@/lib/integrations/instagram-api-client"
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function instagramMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!isRecord(metadata) || !isRecord(metadata.instagram)) return null
  return metadata.instagram
}

function hasVerifiedMessagingPermission(metadata: Record<string, unknown>): boolean {
  if (metadata.permissionsVerified !== true) return true
  const grantedScopes = metadata.grantedScopes
  if (!Array.isArray(grantedScopes)) return false
  return INSTAGRAM_REQUIRED_SCOPES.every(scope => grantedScopes.includes(scope))
}

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

async function recordFailure(input: {
  detail: string
  integrationId: string | null
  organizationId: string
  threadId: string
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

  const metadata = instagramMetadata(igIntegration.metadata)
  if (metadata?.authModel !== "instagram_login") {
    await recordFailure({
      detail: "Legacy Instagram integration cannot send replies",
      integrationId: igIntegration.id,
      organizationId: org.id,
      threadId: thread.id,
    })
    return { ok: false, error: LEGACY_CONVERSATION }
  }

  if (!hasVerifiedMessagingPermission(metadata)) {
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
    !igToken
    || !igIntegration.tokenExpiresAt
    || igIntegration.tokenExpiresAt.getTime() <= Date.now()
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

  const recorded = await recordOutboundCall({
    source,
    provider: "meta",
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

  const result = await sendInstagramTextMessage({
    accessToken: igToken,
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
