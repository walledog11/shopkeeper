import {
  getEmailAuthReauthorizationReason,
  getGmailInboundStatus,
  getGmailWatchFailureCount,
  isEmailAuthReauthorizationRequired,
  isGmailNativeInboundEnrolled,
} from "@shopkeeper/email/providers"
import type { WorkspaceIntegrationDefinition } from "@/lib/integrations/catalog"
import {
  isShopifyIntegrationLinked,
  resolveShopifyConnectionState,
} from "@/lib/integrations/shopify-connection"
import type { Integration } from "@/types"
import type { PillState } from "./StatusPill"

function isTokenExpired(integration: Integration) {
  if (!integration.tokenExpiresAt) return false
  if (integration.platform === "email") return isEmailAuthReauthorizationRequired(integration)
  return new Date(integration.tokenExpiresAt).getTime() < Date.now()
}

function isTokenExpiringSoon(integration: Integration) {
  if (!integration.tokenExpiresAt) return false
  if (integration.platform === "email") return false
  const msLeft = new Date(integration.tokenExpiresAt).getTime() - Date.now()
  return msLeft > 0 && msLeft / 86_400_000 < 10
}

type InstagramHealthStatus = "healthy" | "degraded" | "reconnect_required"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getInstagramHealth(integration: Integration): {
  errorCategory: string | null
  errorCode: string | number | null
  status: InstagramHealthStatus | null
} {
  if (!isRecord(integration.metadata) || !isRecord(integration.metadata.instagram)) {
    return { errorCategory: null, errorCode: null, status: null }
  }
  const instagram = integration.metadata.instagram
  const status = instagram.healthStatus === "healthy"
    || instagram.healthStatus === "degraded"
    || instagram.healthStatus === "reconnect_required"
    ? instagram.healthStatus
    : null
  const error = isRecord(instagram.lastHealthError) ? instagram.lastHealthError : null
  const errorCategory = typeof error?.category === "string" ? error.category : null
  const errorCode = typeof error?.code === "string" || typeof error?.code === "number"
    ? error.code
    : null
  return { errorCategory, errorCode, status }
}

export interface InstagramConnectionDisplay {
  subscription: { action: string; description: string }
  token: { action: string; description: string }
}

export function getInstagramConnectionDisplay(
  integration: Integration,
  now = Date.now(),
): InstagramConnectionDisplay {
  const health = getInstagramHealth(integration)
  const instagram = isRecord(integration.metadata) && isRecord(integration.metadata.instagram)
    ? integration.metadata.instagram
    : {}
  const subscribedFields = Array.isArray(instagram.subscribedFields)
    ? instagram.subscribedFields.filter((field): field is string => typeof field === "string")
    : []
  const messagesActive = subscribedFields.includes("messages")
  const expiresAt = integration.tokenExpiresAt
    ? new Date(integration.tokenExpiresAt).getTime()
    : Number.NaN
  const tokenExpired = Number.isFinite(expiresAt) && expiresAt <= now
  const tokenReconnectRequired = tokenExpired
    || (health.status === "reconnect_required" && health.errorCategory === "authentication")

  const token = tokenReconnectRequired
    ? {
        action: "Reconnect",
        description: "Instagram access expired or was revoked",
      }
    : health.status === "degraded"
      ? {
          action: "Check pending",
          description: "The latest token check was inconclusive; Shopkeeper will retry",
        }
      : Number.isFinite(expiresAt)
        ? {
            action: "Valid",
            description: `Long-lived access token valid until ${new Date(expiresAt).toISOString().slice(0, 10)}`,
          }
        : {
            action: "Unconfirmed",
            description: "Instagram did not provide a usable token expiry",
          }

  const subscription = health.errorCode === "messages_subscription_missing"
    ? {
        action: "Missing",
        description: "Reconnect Instagram to restore DM delivery",
      }
    : messagesActive
      ? health.status === "degraded"
        ? {
            action: "Last confirmed",
            description: "DM delivery was active at the last successful subscription check",
          }
        : {
            action: "Active",
            description: "Instagram is subscribed to new Direct Messages",
          }
      : {
          action: "Unconfirmed",
          description: "The messages subscription has not been confirmed",
        }

  return { subscription, token }
}

const QUIET_CHANNEL_DAYS = 5
const SHOPIFY_EXPIRED_NOTE =
  "Your Shopify connection expired — order lookups and syncing have stopped."
// A token keeps whatever grant it was issued with, so a store connected before
// a capability was added stays short of it until the merchant re-authorizes.
// Without this the shortfall only shows up as a tool call failing mid-ticket.
const SHOPIFY_SHORT_GRANT_NOTE =
  "This store was connected before some newer Shopify actions existed — reconnect to enable them. Until then those actions fail when tried."

export interface IntegrationHealth {
  state: PillState
  note: string | null
  recoveryAction: { kind: "oauth"; label: "Fix" } | null
}

export function deriveIntegrationHealth(
  definition: WorkspaceIntegrationDefinition,
  integration: Integration | null,
  lastActivity: string | null,
  gmailNativeInboundEnabled = false,
): IntegrationHealth {
  if (!integration) return { state: "not-connected", note: null, recoveryAction: null }

  const connectType = definition.connectType

  if (connectType === "ig") {
    const instagramHealth = getInstagramHealth(integration)
    if (instagramHealth.status === "reconnect_required") {
      const note = instagramHealth.errorCode === "messages_subscription_missing"
        ? "Instagram is no longer subscribed to DMs — reconnect Instagram."
        : instagramHealth.errorCode === "account_identity_mismatch"
          ? "The connected Instagram account changed — reconnect Instagram."
          : instagramHealth.errorCategory === "permission"
            ? "Instagram permissions changed — reconnect Instagram to restore DMs."
            : "Your Instagram connection needs to be renewed — reconnect Instagram."
      return { state: "needs-attention", note, recoveryAction: { kind: "oauth", label: "Fix" } }
    }
    if (instagramHealth.status === "degraded") {
      return {
        state: "needs-attention",
        note: "Instagram health could not be confirmed — Shopkeeper will retry automatically.",
        recoveryAction: null,
      }
    }
  }

  if (connectType === "shopify") {
    const shopifyState = resolveShopifyConnectionState(integration)
    if (shopifyState === "invalid") {
      return { state: "needs-attention", note: SHOPIFY_EXPIRED_NOTE, recoveryAction: { kind: "oauth", label: "Fix" } }
    }
    if (!isShopifyIntegrationLinked(integration)) {
      return { state: "not-connected", note: null, recoveryAction: null }
    }
    if (integration.missingScopes?.length) {
      return { state: "needs-attention", note: SHOPIFY_SHORT_GRANT_NOTE, recoveryAction: { kind: "oauth", label: "Fix" } }
    }
  }

  if (isTokenExpired(integration)) {
    const emailAuthIssue = connectType === "email"
      ? getEmailAuthReauthorizationReason(integration)
      : null
    const note = connectType === "ig"
      ? "Your Instagram sign-in expired — new DMs aren't coming in."
      : connectType === "tiktok_shop"
        ? "Your TikTok Shop sign-in expired — new buyer messages aren't coming in."
        : emailAuthIssue === "missing_gmail_read_scope"
          ? "Reconnect Gmail to grant inbox access for native receiving."
          : "Your email sign-in expired — new customer emails aren't coming in."
    return { state: "needs-attention", note, recoveryAction: { kind: "oauth", label: "Fix" } }
  }

  if (isTokenExpiringSoon(integration)) {
    return {
      state: "needs-attention",
      note: "Your sign-in expires soon — renew it now to avoid an interruption.",
      recoveryAction: { kind: "oauth", label: "Fix" },
    }
  }

  if (connectType === "email") {
    const gmailIntegration = definition.id === "gmail" ? integration : null
    if (gmailIntegration && gmailNativeInboundEnabled) {
      if (!isGmailNativeInboundEnrolled(gmailIntegration)) {
        return {
          state: "waiting",
          note: "Reconnect Gmail to activate native receiving.",
          recoveryAction: { kind: "oauth", label: "Fix" },
        }
      }
      const inboundStatus = getGmailInboundStatus(gmailIntegration)
      if (inboundStatus === "degraded") {
        const failureCount = getGmailWatchFailureCount(gmailIntegration)
        return {
          state: "needs-attention",
          note: failureCount > 1
            ? `Gmail watch renewal has failed ${failureCount} times. Sending still works.`
            : "Gmail inbox sync needs attention. Sending still works.",
          recoveryAction: null,
        }
      }
      if (inboundStatus === "reauthorization_required") {
        return {
          state: "needs-attention",
          note: "Reconnect Gmail to restore native inbox sync.",
          recoveryAction: { kind: "oauth", label: "Fix" },
        }
      }
      if (inboundStatus !== "active") {
        return {
          state: "waiting",
          note: "Sending is connected. Native Gmail receiving is pending.",
          recoveryAction: null,
        }
      }
    }
    if (!lastActivity && definition.kind === "forwarding-email") {
      return { state: "waiting", note: null, recoveryAction: null }
    }
    if (lastActivity) {
      const daysQuiet = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86_400_000)
      if (daysQuiet >= QUIET_CHANNEL_DAYS) {
        return {
          state: "needs-attention",
          note: `No new messages in ${daysQuiet} days — check that your support email is still routing to Shopkeeper.`,
          recoveryAction: null,
        }
      }
    }
  }

  return { state: "working", note: null, recoveryAction: null }
}
