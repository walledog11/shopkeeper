import {
  getEmailAuthReauthorizationReason,
  getGmailInboundStatus,
  getGmailLastSyncedAt,
  getGmailWatchFailureCount,
  getEmailProvider,
  isEmailAuthReauthorizationRequired,
  isGmailNativeInboundEnrolled,
} from "@shopkeeper/email/providers"
import type { ConnectType } from "@/lib/integrations/catalog"
import { isEmailIntegrationConfigured } from "@/lib/integrations/onboarding-setup"
import {
  isShopifyIntegrationLinked,
  resolveShopifyConnectionState,
} from "@/lib/integrations/shopify-connection"
import type { Integration } from "@/types"
import { formatRelativeTimestamp } from "@/lib/format/date"
import type { PillState } from "./integration-card-types"

export { isEmailIntegrationConfigured }

export function isTokenExpired(integration: Integration) {
  if (!integration.tokenExpiresAt) return false
  if (integration.platform === "email") return isEmailAuthReauthorizationRequired(integration)
  return new Date(integration.tokenExpiresAt).getTime() < Date.now()
}

export function isTokenExpiringSoon(integration: Integration) {
  if (!integration.tokenExpiresAt) return false
  if (integration.platform === "email") return false
  const msLeft = new Date(integration.tokenExpiresAt).getTime() - Date.now()
  return msLeft > 0 && msLeft / 86_400_000 < 10
}

export function hasIntegrationTokenAlert(integration: Integration) {
  if (integration.platform === "shopify") {
    return resolveShopifyConnectionState(integration) === "invalid"
  }
  return isTokenExpired(integration) || isTokenExpiringSoon(integration)
}

export function isPostmarkEmail(integration: Integration): boolean {
  if (integration.platform !== "email") return false
  return getEmailProvider(integration) === "postmark"
}

export interface EmailReceivingDisplay {
  action: string
  description: string
}

function withLastSuccessfulSync(description: string, integration: Integration): string {
  const lastSyncedAt = getGmailLastSyncedAt(integration)
  return lastSyncedAt
    ? `${description} · Last successful sync: ${formatRelativeTimestamp(lastSyncedAt)}`
    : `${description} · Last successful sync: not yet`
}

export function getEmailReceivingDisplay(
  integration: Integration,
  inboundAddress: string | null,
  gmailNativeInboundEnabled = false,
): EmailReceivingDisplay {
  const provider = getEmailProvider(integration)
  if (provider !== "gmail") {
    return {
      action: inboundAddress ? "Forwarding" : "Setup needed",
      description: inboundAddress
        ? `Forward mail to ${inboundAddress}`
        : "Forward your support inbox to receive tickets",
    }
  }

  const authIssue = getEmailAuthReauthorizationReason(integration)
  if (authIssue) {
    return {
      action: "Reconnect required",
      description: authIssue === "missing_gmail_read_scope"
        ? "Reconnect Gmail to grant inbox access for native receiving"
        : "Reconnect Gmail to restore inbox access",
    }
  }

  if (!gmailNativeInboundEnabled) {
    return {
      action: "Native inbound unavailable",
      description: "Native Gmail receiving is disabled during controlled rollout",
    }
  }

  if (!isGmailNativeInboundEnrolled(integration)) {
    return {
      action: "Setup pending",
      description: "Reconnect Gmail to activate native receiving",
    }
  }

  const inboundStatus = getGmailInboundStatus(integration)
  if (inboundStatus === "active") {
    return {
      action: "Native inbound active",
      description: withLastSuccessfulSync("Native Gmail inbox sync is active", integration),
    }
  }
  if (inboundStatus === "degraded") {
    const failureCount = getGmailWatchFailureCount(integration)
    return {
      action: "Sync degraded",
      description: withLastSuccessfulSync(failureCount > 1
        ? `Gmail watch renewal has failed ${failureCount} times`
        : "Gmail inbox sync needs attention", integration),
    }
  }
  if (inboundStatus === "reauthorization_required") {
    return {
      action: "Reconnect required",
      description: "Reconnect Gmail to restore native inbox sync",
    }
  }
  return {
    action: "Setup pending",
    description: "Native Gmail receiving is pending",
  }
}

const QUIET_CHANNEL_DAYS = 5
const SHOPIFY_EXPIRED_NOTE =
  "Your Shopify connection expired — order lookups and syncing have stopped."

export interface IntegrationHealth {
  state: PillState
  note: string | null
  canFix: boolean
}

export function deriveIntegrationHealth(
  connectType: ConnectType,
  connected: Integration[],
  lastActivity: string | null,
  gmailNativeInboundEnabled = false,
): IntegrationHealth {
  if (!connected.length) return { state: "not-connected", note: null, canFix: false }

  if (connectType === "shopify") {
    const shopifyState = resolveShopifyConnectionState(connected[0])
    if (shopifyState === "invalid") {
      return { state: "needs-attention", note: SHOPIFY_EXPIRED_NOTE, canFix: true }
    }
    if (!isShopifyIntegrationLinked(connected[0])) {
      return { state: "not-connected", note: null, canFix: false }
    }
  }

  if (connected.some(isTokenExpired)) {
    const emailAuthIssue = connectType === "email"
      ? connected.map(getEmailAuthReauthorizationReason).find(Boolean)
      : null
    const note = connectType === "ig"
      ? "Your Instagram sign-in expired — new DMs aren't coming in."
      : connectType === "tiktok_shop"
        ? "Your TikTok Shop sign-in expired — new buyer messages aren't coming in."
        : emailAuthIssue === "missing_gmail_read_scope"
          ? "Reconnect Gmail to grant inbox access for native receiving."
          : "Your email sign-in expired — new customer emails aren't coming in."
    return { state: "needs-attention", note, canFix: true }
  }

  if (connected.some(isTokenExpiringSoon)) {
    return {
      state: "needs-attention",
      note: "Your sign-in expires soon — renew it now to avoid an interruption.",
      canFix: true,
    }
  }

  if (connectType === "email") {
    const gmailIntegration = connected.find(integration => getEmailProvider(integration) === "gmail")
    if (gmailIntegration && gmailNativeInboundEnabled) {
      if (!isGmailNativeInboundEnrolled(gmailIntegration)) {
        return {
          state: "waiting",
          note: "Reconnect Gmail to activate native receiving.",
          canFix: true,
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
          canFix: false,
        }
      }
      if (inboundStatus === "reauthorization_required") {
        return {
          state: "needs-attention",
          note: "Reconnect Gmail to restore native inbox sync.",
          canFix: true,
        }
      }
      if (inboundStatus !== "active") {
        return {
          state: "waiting",
          note: "Sending is connected. Native Gmail receiving is pending.",
          canFix: false,
        }
      }
    }
    if (!lastActivity && connected.every(isPostmarkEmail)) {
      return { state: "waiting", note: null, canFix: false }
    }
    if (lastActivity) {
      const daysQuiet = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86_400_000)
      if (daysQuiet >= QUIET_CHANNEL_DAYS) {
        return {
          state: "needs-attention",
          note: `No new messages in ${daysQuiet} days — check that your support email is still routing to Shopkeeper.`,
          canFix: false,
        }
      }
    }
  }

  return { state: "working", note: null, canFix: false }
}
