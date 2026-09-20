import { parseBooleanEnv } from "@shopkeeper/shared/env"
import { SOCIALAPI_PRODUCTION_BASE_URL } from "@shopkeeper/integrations/socialapi"
import { isInstagramIntegrationEnabledForOrg } from "@/lib/env"
import { normalizeAbsoluteUrl, readEnv } from "@/lib/env/helpers"
import logger from "@/lib/server/logger"

/**
 * The vendor ceiling for the launch envelope. Brand and scoped-key provisioning
 * is an audited operator workflow (transport plan, "Initial launch envelope"),
 * so the assignment map *is* the slot allocation: a workspace can only connect
 * if an operator has already provisioned a brand for it. Bounding the map
 * bounds the slots without counting rows, which is why there is no connect-time
 * race to lose.
 */
const MAX_ASSIGNED_ORGS_CEILING = 8

export interface SocialApiConnectConfig {
  apiKey: string
  baseUrl: string
  brandAssignments: ReadonlyMap<string, string>
  maxActiveOrgs: number
}

/** Which Instagram connect flow, if any, this workspace may start. */
export type InstagramConnectTransport = "socialapi" | "meta_direct" | null

function parseMaxActiveOrgs(): number {
  const raw = readEnv("SOCIALAPI_MAX_ACTIVE_ORGS")
  if (!raw) return MAX_ASSIGNED_ORGS_CEILING
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_ASSIGNED_ORGS_CEILING) {
    throw new Error(
      `[Dashboard] SOCIALAPI_MAX_ACTIVE_ORGS must be an integer from 1 to ${MAX_ASSIGNED_ORGS_CEILING}`,
    )
  }
  return parsed
}

/**
 * `clerk_org_id:brand_id` pairs. Keyed on the Clerk organization because that is
 * the identity the authenticated connect session carries and the identity an
 * operator provisioning a brand has in front of them.
 */
function parseBrandAssignments(): Map<string, string> {
  const assignments = new Map<string, string>()
  for (const entry of (readEnv("SOCIALAPI_BRAND_ASSIGNMENTS") ?? "").split(",")) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const separator = trimmed.indexOf(":")
    const clerkOrgId = separator === -1 ? "" : trimmed.slice(0, separator).trim()
    const brandId = separator === -1 ? "" : trimmed.slice(separator + 1).trim()
    if (!clerkOrgId || !brandId) {
      throw new Error(
        "[Dashboard] SOCIALAPI_BRAND_ASSIGNMENTS entries must be clerk_org_id:brand_id",
      )
    }
    if (assignments.has(clerkOrgId)) {
      throw new Error(
        "[Dashboard] SOCIALAPI_BRAND_ASSIGNMENTS assigns one workspace two brands",
      )
    }
    assignments.set(clerkOrgId, brandId)
  }
  return assignments
}

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

export function getSocialApiConnectConfig(): SocialApiConnectConfig | null {
  if (!parseBooleanEnv(readEnv, "SOCIALAPI_ENABLED", false, "Dashboard")) return null

  const apiKey = readEnv("SOCIALAPI_API_KEY")
  if (!apiKey) {
    logger.error("[SocialAPI] SOCIALAPI_ENABLED is set without SOCIALAPI_API_KEY")
    return null
  }

  const maxActiveOrgs = parseMaxActiveOrgs()
  const brandAssignments = parseBrandAssignments()
  if (brandAssignments.size > maxActiveOrgs) {
    logger.error(
      { assigned: brandAssignments.size, maxActiveOrgs },
      "[SocialAPI] SOCIALAPI_BRAND_ASSIGNMENTS exceeds the assigned-slot cap — connect is closed",
    )
    return null
  }

  return { apiKey, baseUrl: readBaseUrl(), brandAssignments, maxActiveOrgs }
}

export function resolveSocialApiBrandForOrg(
  clerkOrganizationId?: string | null,
): { apiKey: string; baseUrl: string; brandId: string } | null {
  if (typeof clerkOrganizationId !== "string" || !clerkOrganizationId) return null
  const config = getSocialApiConnectConfig()
  if (!config) return null
  const brandId = config.brandAssignments.get(clerkOrganizationId)
  return brandId ? { apiKey: config.apiKey, baseUrl: config.baseUrl, brandId } : null
}

/**
 * The single owner of "which Instagram connect may this workspace start?".
 *
 * SocialAPI is the selected `ig_dm` transport through the first 100 users, so an
 * assigned workspace gets it. Direct Meta remains reachable only for a workspace
 * still on the direct allowlist, and a workspace with neither sees no connect at
 * all. Every caller — the card, the connect route, the callback — asks here
 * rather than re-deriving the answer from the two flags.
 */
export function resolveInstagramConnectTransport(
  clerkOrganizationId?: string | null,
): InstagramConnectTransport {
  if (resolveSocialApiBrandForOrg(clerkOrganizationId)) return "socialapi"
  if (isInstagramIntegrationEnabledForOrg(clerkOrganizationId)) return "meta_direct"
  return null
}
