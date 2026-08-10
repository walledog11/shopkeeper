import { describe, expect, it } from "vitest"
import { GMAIL_READONLY_SCOPE } from "@shopkeeper/email/providers"
import type { Integration } from "@/types"
import { getIntegrationDefinition, type WorkspaceIntegrationDefinition } from "@/lib/integrations/catalog"
import {
  deriveIntegrationHealth,
  getInstagramConnectionDisplay,
} from "./integration-card-helpers"
import { deriveGmailPresentation } from "./gmail-configure-state"

const SHOPIFY = getIntegrationDefinition("shopify") as WorkspaceIntegrationDefinition
const INSTAGRAM = getIntegrationDefinition("instagram") as WorkspaceIntegrationDefinition
const GMAIL = getIntegrationDefinition("gmail") as WorkspaceIntegrationDefinition

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
      instagram: {
        authModel: "instagram_login",
        healthStatus,
        lastHealthError,
        subscribedFields: ["messages"],
      },
    },
    createdAt: new Date().toISOString(),
  }
}

function shopifyIntegration(missingScopes?: string[]): Integration {
  return {
    id: "shopify-integration",
    organizationId: "org-id",
    platform: "shopify",
    externalAccountId: "palette-dev.myshopify.com",
    fromEmail: null,
    tokenExpiresAt: null,
    connectionState: "active",
    ...(missingScopes && { missingScopes }),
    createdAt: new Date().toISOString(),
  }
}

describe("Shopify integration health", () => {
  it("asks for a reconnect when the recorded grant is short of a capability", () => {
    const integration = shopifyIntegration(["read_returns", "write_returns"])

    expect(deriveIntegrationHealth(SHOPIFY, integration, null)).toEqual({
      state: "needs-attention",
      note: "This store was connected before some newer Shopify actions existed — reconnect to enable them. Until then those actions fail when tried.",
      recoveryAction: { kind: "oauth", label: "Fix" },
    })
  })

  // An install that predates scope recording has no grant on file. Reporting
  // that as a shortfall would send every such merchant through a pointless
  // reconnect.
  it("says nothing when the grant was never recorded", () => {
    expect(deriveIntegrationHealth(SHOPIFY, shopifyIntegration(), null)).toEqual({
      state: "working",
      note: null,
      recoveryAction: null,
    })
  })

  it("reports the expired connection ahead of any shortfall", () => {
    const integration = shopifyIntegration(["read_returns"])
    integration.connectionState = "invalid"

    expect(deriveIntegrationHealth(SHOPIFY, integration, null)).toMatchObject({
      note: "Your Shopify connection expired — order lookups and syncing have stopped.",
    })
  })
})

describe("Instagram integration health", () => {
  it("shows a transient health failure without asking the merchant to reconnect", () => {
    const integration = instagramIntegration("degraded", {
      category: "transient_provider_failure",
      code: 2,
    })

    expect(deriveIntegrationHealth(INSTAGRAM, integration, null)).toEqual({
      state: "needs-attention",
      note: "Instagram health could not be confirmed — Shopkeeper will retry automatically.",
      recoveryAction: null,
    })
  })

  it("offers reconnect when the messages subscription is missing", () => {
    const integration = instagramIntegration("reconnect_required", {
      category: "permission",
      code: "messages_subscription_missing",
    })

    expect(deriveIntegrationHealth(INSTAGRAM, integration, null)).toEqual({
      state: "needs-attention",
      note: "Instagram is no longer subscribed to DMs — reconnect Instagram.",
      recoveryAction: { kind: "oauth", label: "Fix" },
    })
  })

  it("keeps a confirmed healthy connection working", () => {
    const integration = instagramIntegration("healthy")

    expect(deriveIntegrationHealth(INSTAGRAM, integration, null)).toEqual({
      state: "working",
      note: null,
      recoveryAction: null,
    })
  })

  it("shows token and DM subscription health separately", () => {
    const integration = instagramIntegration("healthy")
    integration.tokenExpiresAt = "2026-08-14T00:00:00.000Z"

    expect(getInstagramConnectionDisplay(
      integration,
      new Date("2026-07-15T00:00:00.000Z").getTime(),
    )).toEqual({
      token: {
        action: "Valid",
        description: "Long-lived access token valid until 2026-08-14",
      },
      subscription: {
        action: "Active",
        description: "Instagram is subscribed to new Direct Messages",
      },
    })
  })

  it("distinguishes an expired token from a missing messages subscription", () => {
    const expired = instagramIntegration("reconnect_required", {
      category: "authentication",
      code: 190,
    })
    expired.tokenExpiresAt = "1970-01-01T00:00:00.000Z"
    expect(getInstagramConnectionDisplay(expired).token.action).toBe("Reconnect")

    const missingSubscription = instagramIntegration("reconnect_required", {
      category: "permission",
      code: "messages_subscription_missing",
    })
    expect(getInstagramConnectionDisplay(missingSubscription).subscription).toEqual({
      action: "Missing",
      description: "Reconnect Instagram to restore DM delivery",
    })
  })
})

describe("Gmail integration health", () => {
  it("requires reconnection when gmail.readonly was not granted", () => {
    const integration = gmailIntegration({
      oauthScopes: ["openid", "https://www.googleapis.com/auth/gmail.send"],
    })

    expect(deriveIntegrationHealth(GMAIL, integration, null, true)).toEqual({
      state: "needs-attention",
      note: "Reconnect Gmail to grant inbox access for native receiving.",
      recoveryAction: { kind: "oauth", label: "Fix" },
    })
    expect(deriveGmailPresentation(
      integration,
      null,
      true,
      deriveIntegrationHealth(GMAIL, integration, null, true),
    )).toMatchObject({
      scene: "needs_reconnect",
      receiving: { status: "Needs attention" },
    })
  })

  it("asks existing Gmail connections to reconnect before native enrollment", () => {
    const integration = gmailIntegration({ oauthScopes: [GMAIL_READONLY_SCOPE] })

    expect(deriveIntegrationHealth(GMAIL, integration, null, true)).toEqual({
      state: "waiting",
      note: "Reconnect Gmail to activate native receiving.",
      recoveryAction: { kind: "oauth", label: "Fix" },
    })
    expect(deriveGmailPresentation(
      integration,
      null,
      true,
      deriveIntegrationHealth(GMAIL, integration, null, true),
    ).scene).toBe("needs_reconnect")
  })

  it("shows enrolled native receiving as pending before watch setup", () => {
    const integration = gmailIntegration({
      inboundMode: "hybrid",
      oauthScopes: [GMAIL_READONLY_SCOPE],
    })

    expect(deriveIntegrationHealth(GMAIL, integration, null, true)).toEqual({
      state: "waiting",
      note: "Sending is connected. Native Gmail receiving is pending.",
      recoveryAction: null,
    })
    expect(deriveGmailPresentation(
      integration,
      null,
      true,
      deriveIntegrationHealth(GMAIL, integration, null, true),
    ).receiving.status).toBe("Setup needed")
  })

  it("shows active native receiving as healthy", () => {
    const integration = gmailIntegration({
      oauthScopes: [GMAIL_READONLY_SCOPE],
      gmail: { inboundStatus: "active" },
    })

    expect(deriveIntegrationHealth(GMAIL, integration, null, true)).toEqual({
      state: "working",
      note: null,
      recoveryAction: null,
    })
    expect(deriveGmailPresentation(
      integration,
      null,
      true,
      deriveIntegrationHealth(GMAIL, integration, null, true),
    ).receiving).toEqual({
      title: "Receiving messages",
      description: "Customer emails sent to your Gmail inbox appear here automatically.",
      status: "Active",
    })
  })

  it("keeps native receiving active when sync metadata is present", () => {
    const integration = gmailIntegration({
      oauthScopes: [GMAIL_READONLY_SCOPE],
      gmail: {
        inboundStatus: "active",
        lastSyncedAt: new Date().toISOString(),
      },
    })

    expect(deriveGmailPresentation(
      integration,
      null,
      true,
      deriveIntegrationHealth(GMAIL, integration, null, true),
    ).receiving.status).toBe("Active")
  })

  it("surfaces a degraded Gmail watch without claiming the OAuth grant expired", () => {
    const integration = gmailIntegration({
      oauthScopes: [GMAIL_READONLY_SCOPE],
      gmail: { inboundStatus: "degraded" },
    })

    expect(deriveIntegrationHealth(GMAIL, integration, null, true)).toEqual({
      state: "needs-attention",
      note: "Gmail inbox sync needs attention. Sending still works.",
      recoveryAction: null,
    })
  })

  it("surfaces repeated Gmail watch renewal failures", () => {
    const integration = gmailIntegration({
      oauthScopes: [GMAIL_READONLY_SCOPE],
      gmail: { inboundStatus: "degraded", watchFailureCount: 3 },
    })

    expect(deriveIntegrationHealth(GMAIL, integration, null, true)).toEqual({
      state: "needs-attention",
      note: "Gmail watch renewal has failed 3 times. Sending still works.",
      recoveryAction: null,
    })
    expect(deriveGmailPresentation(
      integration,
      null,
      true,
      deriveIntegrationHealth(GMAIL, integration, null, true),
    ).receiving.status).toBe("Needs attention")
  })

  it("keeps the disabled native-inbound state scoped to Gmail", () => {
    const integration = gmailIntegration({
      oauthScopes: [GMAIL_READONLY_SCOPE],
      gmail: { inboundStatus: "active" },
    })

    expect(deriveGmailPresentation(
      integration,
      null,
      false,
      deriveIntegrationHealth(GMAIL, integration, null, false),
    ).scene).toBe("needs_forwarding")
    expect(deriveIntegrationHealth(GMAIL, integration, null, false)).toEqual({
      state: "working",
      note: null,
      recoveryAction: null,
    })
  })
})
