import {
  getEmailProvider,
  isEmailAuthReauthorizationRequired,
} from "@/lib/messaging/email/providers"
import type { ConnectType } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import type { PillState } from "./integration-card-types"

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
  return isTokenExpired(integration) || isTokenExpiringSoon(integration)
}

export function isPostmarkEmail(integration: Integration): boolean {
  if (integration.platform !== "email") return false
  return getEmailProvider(integration) === "postmark"
}

const QUIET_CHANNEL_DAYS = 5

export interface IntegrationHealth {
  state: PillState
  // Plain-language problem + consequence; null when nothing is wrong
  note: string | null
  canFix: boolean
}

export function deriveIntegrationHealth(
  connectType: ConnectType,
  connected: Integration[],
  lastActivity: string | null,
): IntegrationHealth {
  if (!connected.length) return { state: 'not-connected', note: null, canFix: false }

  if (connected.some(isTokenExpired)) {
    const note =
      connectType === 'shopify'
        ? 'Your Shopify connection expired — order lookups and syncing have stopped.'
        : connectType === 'ig'
        ? "Your Instagram sign-in expired — new DMs aren't coming in."
        : "Your email sign-in expired — new customer emails aren't coming in."
    return { state: 'needs-attention', note, canFix: true }
  }

  if (connected.some(isTokenExpiringSoon)) {
    return {
      state: 'needs-attention',
      note: 'Your sign-in expires soon — renew it now to avoid an interruption.',
      canFix: true,
    }
  }

  if (connectType === 'email') {
    if (!lastActivity && connected.every(isPostmarkEmail)) {
      return { state: 'waiting', note: null, canFix: false }
    }
    if (lastActivity) {
      const daysQuiet = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86_400_000)
      if (daysQuiet >= QUIET_CHANNEL_DAYS) {
        return {
          state: 'needs-attention',
          note: `No new messages in ${daysQuiet} days — check that your support email is still routing to Shopkeeper.`,
          canFix: false,
        }
      }
    }
  }

  return { state: 'working', note: null, canFix: false }
}
