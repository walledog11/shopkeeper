import {
  getEmailAuthReauthorizationReason,
  getGmailAccountType,
  getGmailInboundStatus,
} from "@shopkeeper/email/providers"
import { formatLastActivityTime } from "@/lib/format/date"
import type { Integration } from "@/types"
import type { IntegrationHealth } from "./integration-card-helpers"

export type GmailConfigureScene = "ready" | "needs_forwarding" | "needs_reconnect"

const GMAIL_FORWARDING_GUIDE = [
  "Open Gmail → Settings (gear) → See all settings → Forwarding and POP/IMAP.",
  "Click \"Add a forwarding address\" and paste the Shopkeeper address below.",
  "Gmail sends a verification code — it appears as a new ticket here. Paste the code back into Gmail.",
  "Choose \"Forward a copy of incoming mail to…\" and keep Gmail's copy in the inbox.",
] as const

export function gmailReplyAddress(integration: Integration): string {
  return integration.fromEmail || integration.externalAccountId
}

export function isGmailWorkspaceAccount(integration: Integration): boolean {
  return getGmailAccountType(integration) === "workspace"
}

/** Address customers email and that inbound sync matches against. */
export function gmailCustomerAddress(integration: Integration): string {
  return gmailReplyAddress(integration)
}

export function usesCustomReplyAddress(integration: Integration): boolean {
  const from = integration.fromEmail?.trim().toLowerCase()
  const account = integration.externalAccountId.trim().toLowerCase()
  return !!from && from !== account
}

export function needsGmailForwardingSetup(
  integration: Integration,
  lastActivity: string | null,
  gmailNativeInboundEnabled: boolean,
): boolean {
  if (getEmailAuthReauthorizationReason(integration)) return false

  if (gmailNativeInboundEnabled && getGmailInboundStatus(integration) === "active") {
    return false
  }

  return !lastActivity
}

export function deriveGmailConfigureScene(
  integration: Integration,
  lastActivity: string | null,
  gmailNativeInboundEnabled: boolean,
  health: IntegrationHealth,
): GmailConfigureScene {
  if (health.canFix) return "needs_reconnect"

  if (needsGmailForwardingSetup(integration, lastActivity, gmailNativeInboundEnabled)) {
    return "needs_forwarding"
  }

  return "ready"
}

export function gmailReceivingSummary(
  integration: Integration,
  lastActivity: string | null,
  gmailNativeInboundEnabled: boolean,
): { title: string; description: string; status: string } {
  const authIssue = getEmailAuthReauthorizationReason(integration)
  if (authIssue) {
    return {
      title: "Receiving messages",
      description: authIssue === "missing_gmail_read_scope"
        ? "Reconnect Gmail to receive customer emails here."
        : "Your Gmail sign-in expired. Reconnect to receive messages again.",
      status: "Needs attention",
    }
  }

  if (gmailNativeInboundEnabled) {
    const inboundStatus = getGmailInboundStatus(integration)
    if (inboundStatus === "degraded") {
      return {
        title: "Receiving messages",
        description: "Some messages may be delayed. Sending still works.",
        status: "Needs attention",
      }
    }
    if (inboundStatus === "active") {
      return {
        title: "Receiving messages",
        description: "Customer emails sent to your Gmail inbox appear here automatically.",
        status: "Active",
      }
    }
  }

  if (lastActivity) {
    return {
      title: "Receiving messages",
      description: "Mail forwarded from your Gmail inbox is arriving in Shopkeeper.",
      status: "Active",
    }
  }

  return {
    title: "Receiving messages",
    description: "Forward Gmail to Shopkeeper so customer emails show up here.",
    status: "Setup needed",
  }
}

export function gmailConfigureStatusLine(
  scene: GmailConfigureScene,
  integration: Integration,
  lastActivity: string | null,
  health: IntegrationHealth,
): string | null {
  if (health.note) return health.note

  if (scene === "needs_forwarding") {
    return `Forward mail sent to ${gmailCustomerAddress(integration)} to finish setup.`
  }

  if (scene === "ready") {
    const parts = [`Replies send from ${gmailReplyAddress(integration)}`]
    if (lastActivity) parts.push(`Last message ${formatLastActivityTime(lastActivity)}`)
    return parts.join(" · ")
  }

  return null
}

export { GMAIL_FORWARDING_GUIDE }
