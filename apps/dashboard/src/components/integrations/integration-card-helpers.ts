import {
  getEmailProvider,
  isEmailAuthReauthorizationRequired,
} from "@/lib/messaging/email/providers"
import type { Integration } from "@/types"

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
