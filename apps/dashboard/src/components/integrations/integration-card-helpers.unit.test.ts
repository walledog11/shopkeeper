import { describe, expect, it } from "vitest"
import { GMAIL_READONLY_SCOPE } from "@shopkeeper/email/providers"
import type { Integration } from "@/types"
import {
  deriveIntegrationHealth,
  getEmailReceivingDisplay,
} from "./integration-card-helpers"

function gmailIntegration(metadata: Record<string, unknown>): Integration {
  return {
    id: "gmail-integration",
    organizationId: "org-id",
    platform: "email",
    externalAccountId: "merchant@gmail.test",
    fromEmail: "support@example.test",
    tokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    metadata: { provider: "gmail", ...metadata },
    createdAt: new Date().toISOString(),
  }
}

function instagramIntegration(
  healthStatus: "healthy" | "degraded" | "reconnect_required",
  lastHealthError: Record<string, unknown> | null = null,
): Integration {
  return {
    id: "instagram-integration",
    organizationId: "org-id",
    platform: "ig_dm",
    externalAccountId: "ig-1",
    fromEmail: "merchant",
    tokenExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    metadata: {
      instagram: { authModel: "instagram_login", healthStatus, lastHealthError },
    },
    createdAt: new Date().toISOString(),
  }
}

describe("Instagram integration health", () => {
  it("shows a transient health failure without asking the merchant to reconnect", () => {
    const integration = instagramIntegration("degraded", {
      category: "transient_provider_failure",
      code: 2,
    })

    expect(deriveIntegrationHealth("ig", [integration], null)).toEqual({
      state: "needs-attention",
      note: "Instagram health could not be confirmed — Shopkeeper will retry automatically.",
      canFix: false,
    })
  })

  it("offers reconnect when the messages subscription is missing", () => {
    const integration = instagramIntegration("reconnect_required", {
      category: "permission",
      code: "messages_subscription_missing",
    })

    expect(deriveIntegrationHealth("ig", [integration], null)).toEqual({
      state: "needs-attention",
      note: "Instagram is no longer subscribed to DMs — reconnect Instagram.",
      canFix: true,
    })
  })

  it("keeps a confirmed healthy connection working", () => {
    const integration = instagramIntegration("healthy")

    expect(deriveIntegrationHealth("ig", [integration], null)).toEqual({
      state: "working",
      note: null,
      canFix: false,
    })
  })
})

describe("Gmail integration health", () => {
  it("requires reconnection when gmail.readonly was not granted", () => {
    const integration = gmailIntegration({
      oauthScopes: ["openid", "https://www.googleapis.com/auth/gmail.send"],
    })

    expect(deriveIntegrationHealth("email", [integration], null, true)).toEqual({
      state: "needs-attention",
      note: "Reconnect Gmail to grant inbox access for native receiving.",
      canFix: true,
    })
    expect(getEmailReceivingDisplay(integration, "org-id@inbound.example.test", true)).toEqual({
      action: "Reconnect required",
      description: "Reconnect Gmail to grant inbox access for native receiving",
    })
  })

  it("asks existing Gmail connections to reconnect before native enrollment", () => {
    const integration = gmailIntegration({ oauthScopes: [GMAIL_READONLY_SCOPE] })

    expect(deriveIntegrationHealth("email", [integration], null, true)).toEqual({
      state: "waiting",
      note: "Reconnect Gmail to activate native receiving.",
      canFix: true,
    })
    expect(getEmailReceivingDisplay(integration, null, true)).toEqual({
      action: "Setup pending",
      description: "Reconnect Gmail to activate native receiving",
    })
  })

  it("shows enrolled native receiving as pending before watch setup", () => {
    const integration = gmailIntegration({
      inboundMode: "hybrid",
      oauthScopes: [GMAIL_READONLY_SCOPE],
    })

    expect(deriveIntegrationHealth("email", [integration], null, true)).toEqual({
      state: "waiting",
      note: "Sending is connected. Native Gmail receiving is pending.",
      canFix: false,
    })
    expect(getEmailReceivingDisplay(integration, null, true)).toEqual({
      action: "Setup pending",
      description: "Native Gmail receiving is pending",
    })
  })

  it("shows active native receiving as healthy", () => {
    const integration = gmailIntegration({
      oauthScopes: [GMAIL_READONLY_SCOPE],
      gmail: { inboundStatus: "active" },
    })

    expect(deriveIntegrationHealth("email", [integration], null, true)).toEqual({
      state: "working",
      note: null,
      canFix: false,
    })
    expect(getEmailReceivingDisplay(integration, null, true)).toEqual({
      action: "Native inbound active",
      description: "Native Gmail inbox sync is active · Last successful sync: not yet",
    })
  })

  it("shows the last successful Gmail sync", () => {
    const integration = gmailIntegration({
      oauthScopes: [GMAIL_READONLY_SCOPE],
      gmail: {
        inboundStatus: "active",
        lastSyncedAt: new Date().toISOString(),
      },
    })

    expect(getEmailReceivingDisplay(integration, null, true)).toEqual({
      action: "Native inbound active",
      description: "Native Gmail inbox sync is active · Last successful sync: just now",
    })
  })

  it("surfaces a degraded Gmail watch without claiming the OAuth grant expired", () => {
    const integration = gmailIntegration({
      oauthScopes: [GMAIL_READONLY_SCOPE],
      gmail: { inboundStatus: "degraded" },
    })

    expect(deriveIntegrationHealth("email", [integration], null, true)).toEqual({
      state: "needs-attention",
      note: "Gmail inbox sync needs attention. Sending still works.",
      canFix: false,
    })
  })

  it("surfaces repeated Gmail watch renewal failures", () => {
    const integration = gmailIntegration({
      oauthScopes: [GMAIL_READONLY_SCOPE],
      gmail: { inboundStatus: "degraded", watchFailureCount: 3 },
    })

    expect(deriveIntegrationHealth("email", [integration], null, true)).toEqual({
      state: "needs-attention",
      note: "Gmail watch renewal has failed 3 times. Sending still works.",
      canFix: false,
    })
    expect(getEmailReceivingDisplay(integration, null, true)).toEqual({
      action: "Sync degraded",
      description: "Gmail watch renewal has failed 3 times · Last successful sync: not yet",
    })
  })

  it("keeps the disabled native-inbound state scoped to Gmail", () => {
    const integration = gmailIntegration({
      oauthScopes: [GMAIL_READONLY_SCOPE],
      gmail: { inboundStatus: "active" },
    })

    expect(getEmailReceivingDisplay(
      integration,
      "org-id@inbound.example.test",
      false,
    )).toEqual({
      action: "Native inbound unavailable",
      description: "Native Gmail receiving is disabled during controlled rollout",
    })
    expect(deriveIntegrationHealth("email", [integration], null, false)).toEqual({
      state: "working",
      note: null,
      canFix: false,
    })
  })
})
