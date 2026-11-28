import { SOCIALAPI_PRODUCTION_BASE_URL } from "@shopkeeper/integrations/socialapi"
import { isInstagramIntegrationEnabledForOrg } from "@/lib/env"
import { normalizeAbsoluteUrl, readEnv } from "@/lib/env/helpers"
import logger from "@/lib/server/logger"

export interface SocialApiConnectConfig {
  apiKey: string
  baseUrl: string
  brandId: string
}

/** Which Instagram connect flow, if any, this workspace may start. */
export type InstagramConnectTransport = "socialapi" | "meta_direct" | null

function readBaseUrl(): string {
  const override = readEnv("SOCIALAPI_BASE_URL")
  if (!override) return SOCIALAPI_PRODUCTION_BASE_URL
  // A test origin in production would route merchant OAuth and DMs somewhere
  // other than the vendor. Pin the official origin there and let the override
  // exist only for local and staging work.
  if (process.env.NODE_ENV === "production") {
    logger.error("[SocialAPI] SOCIALAPI_BASE_URL is ignored in production")
    return SOCIALAPI_PRODUCTION_BASE_URL
  }
  return normalizeAbsoluteUrl("SOCIALAPI_BASE_URL", override)
}

/**
 * Instagram connect through SocialAPI is open to every workspace once the key and
 * the one brand every workspace connects under are set.
 */
export function getSocialApiConnectConfig(): SocialApiConnectConfig | null {
  const apiKey = readEnv("SOCIALAPI_API_KEY")
  const brandId = readEnv("SOCIALAPI_BRAND_ID")
  if (!apiKey || !brandId) return null
  return { apiKey, baseUrl: readBaseUrl(), brandId }
}

/**
 * The single owner of "which Instagram connect may this workspace start?".
 * SocialAPI whenever it is configured; otherwise direct Meta for a workspace on
 * the direct allowlist; otherwise none. Every caller — the card, the connect
 * route, the callback — asks here rather than re-deriving the answer.
 */
export function resolveInstagramConnectTransport(
  clerkOrganizationId?: string | null,
): InstagramConnectTransport {
  if (getSocialApiConnectConfig()) return "socialapi"
  if (isInstagramIntegrationEnabledForOrg(clerkOrganizationId)) return "meta_direct"
  return null
}
