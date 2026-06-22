import { db } from "@shopkeeper/db"
import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import logger from "@/lib/server/logger"
import { recordOutboundCall } from "@/lib/server/outbound-recorder"
import { recordInstagramSendFailure } from "@/lib/messaging/provider-send-failures"
import type {
  DispatchOrg,
  DispatchProviderResult,
  DispatchSource,
  DispatchThread,
} from "./dispatch-message-types"

export async function dispatchInstagramDirect(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
  source: DispatchSource,
): Promise<DispatchProviderResult> {
  const recipientId = thread.customer.platformId
  const igIntegration = await db.integration.findFirst({
    where: { organizationId: org.id, platform: CHANNEL_TYPE.IG_DM },
  })
  const igToken = igIntegration?.accessToken
  const igAccountId = igIntegration?.externalAccountId

  if (!igAccountId) {
    return { ok: false, error: "No Instagram integration configured" }
  }

  const recorded = await recordOutboundCall({
    source,
    provider: "meta",
    channel: "ig_dm",
    organizationId: org.id,
    threadId: thread.id,
    to: recipientId,
    from: igAccountId,
    text,
    metadata: { igAccountId },
  })
  if (!recorded && !igToken) {
    return { ok: false, error: "No Instagram integration configured" }
  }

  if (!recorded) {
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${igAccountId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${igToken}` },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
    })

    if (!metaRes.ok) {
      const errBody = await metaRes.json().catch(() => ({})) as {
        error?: { code?: number; error_subcode?: number }
      }
      const code = errBody.error?.code
      const subcode = errBody.error?.error_subcode
      const isExpired = code === 190
      const isOutsideWindow = code === 10 && subcode === 2018278
      const userMessage = isOutsideWindow
        ? "Instagram only allows replies within 24 hours of the customer's last message"
        : isExpired
          ? "Instagram token expired"
          : "Failed to send via Instagram"
      const detail = isOutsideWindow
        ? "Outside Instagram 24-hour messaging window"
        : isExpired
          ? "Instagram token expired"
          : "Meta Graph API returned non-OK"
      logger.error({ err: errBody }, "[dispatchMessage] Meta API failed")
      await recordInstagramSendFailure({
        organizationId: org.id,
        threadId: thread.id,
        integrationId: igIntegration?.id ?? null,
        detail,
      })
      return { ok: false, error: userMessage, providerStatus: metaRes.status }
    }
  }

  return { ok: true }
}
