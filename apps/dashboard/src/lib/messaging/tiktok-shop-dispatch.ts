import { db } from "@shopkeeper/db"
import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import logger from "@/lib/server/logger"
import { recordOutboundCall } from "@/lib/server/outbound-recorder"
import { getTikTokShopApiConfig } from "@/lib/tiktok-shop/config"
import {
  sendTikTokShopTextMessage,
  TikTokShopProviderError,
} from "@/lib/tiktok-shop/client"
import { recordTikTokShopSendFailure } from "@/lib/messaging/provider-send-failures"
import type {
  DispatchOrg,
  DispatchProviderResult,
  DispatchSource,
  DispatchThread,
} from "./dispatch-message-types"

export async function dispatchTikTokShopMessage(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
  source: DispatchSource,
): Promise<DispatchProviderResult> {
  const parsedIdentity = parseTikTokShopPlatformId(thread.customer.platformId)
  const tiktokIntegration = await db.integration.findFirst({
    where: {
      organizationId: org.id,
      platform: CHANNEL_TYPE.TIKTOK,
      ...(parsedIdentity?.externalAccountId && { externalAccountId: parsedIdentity.externalAccountId }),
    },
  })

  if (!tiktokIntegration?.externalAccountId) {
    return { ok: false, error: "No TikTok Shop integration configured" }
  }

  const accessToken = tiktokIntegration.accessToken
  if (!accessToken) {
    return { ok: false, error: "TikTok Shop token expired" }
  }

  const config = getTikTokShopApiConfig()
  if (!config) {
    return { ok: false, error: "TikTok Shop messaging is not configured" }
  }

  const conversationId = thread.externalSpaceId
    ?? parsedIdentity?.conversationId
    ?? thread.customer.platformId

  const recorded = await recordOutboundCall({
    source,
    provider: "tiktok_shop",
    channel: "tiktok",
    organizationId: org.id,
    threadId: thread.id,
    to: conversationId,
    from: tiktokIntegration.externalAccountId,
    text,
    metadata: {
      integrationId: tiktokIntegration.id,
      recipientId: parsedIdentity?.buyerId ?? null,
    },
  })
  if (recorded) return { ok: true }

  try {
    await sendTikTokShopTextMessage({
      accessToken,
      config,
      conversationId,
      recipientId: parsedIdentity?.buyerId ?? null,
      text,
    })
  } catch (err) {
    const mapped = mapTikTokShopDispatchError(err)
    logger.error({ err, category: mapped.detail }, "[dispatchMessage] TikTok Shop send failed")
    await recordTikTokShopSendFailure({
      organizationId: org.id,
      threadId: thread.id,
      integrationId: tiktokIntegration.id,
      detail: mapped.detail,
    })
    return {
      ok: false,
      error: mapped.error,
      ...(mapped.providerStatus && { providerStatus: mapped.providerStatus }),
    }
  }

  return { ok: true }
}

function parseTikTokShopPlatformId(platformId: string): {
  buyerId: string | null
  conversationId: string
  externalAccountId: string | null
} | null {
  const parts = platformId.split(":")
  if (parts.length >= 3 && parts[0] === "tiktok") {
    return {
      externalAccountId: parts[1] || null,
      conversationId: parts.slice(2).join(":"),
      buyerId: parts.slice(2).join(":"),
    }
  }
  return null
}

function mapTikTokShopDispatchError(err: unknown): {
  detail: string
  error: string
  providerStatus?: number
} {
  if (err instanceof TikTokShopProviderError) {
    if (err.category === "expired_token") {
      return {
        detail: "TikTok Shop token expired",
        error: "TikTok Shop token expired",
        providerStatus: err.providerStatus,
      }
    }
    if (err.category === "rate_limited") {
      return {
        detail: "TikTok Shop rate limit exceeded",
        error: "TikTok Shop rate limit exceeded",
        providerStatus: err.providerStatus,
      }
    }
    if (err.category === "policy_window") {
      return {
        detail: "Outside TikTok Shop response window or policy",
        error: "TikTok Shop only allows replies inside the buyer-service response window",
        providerStatus: err.providerStatus,
      }
    }
    return {
      detail: err.message,
      error: err.category === "provider_unavailable"
        ? "TikTok Shop is temporarily unavailable"
        : "Failed to send via TikTok Shop",
      providerStatus: err.providerStatus,
    }
  }

  return {
    detail: err instanceof Error ? err.message : String(err),
    error: "Failed to send via TikTok Shop",
  }
}
