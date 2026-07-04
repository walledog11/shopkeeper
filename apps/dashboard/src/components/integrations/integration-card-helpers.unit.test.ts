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

describe("Gmail integration health", () => {
  it("requires reconnection when gmail.readonly was not granted", () => {
    const integration = gmailIntegration({
      oauthScopes: ["openid", "https://www.googleapis.com/auth/gmail.send"],
    })

    expect(deriveIntegrationHealth("email", [integration], null)).toEqual({
      state: "needs-attention",
      note: "Reconnect Gmail to grant inbox access for native receiving.",
      canFix: true,
    })
    expect(getEmailReceivingDisplay(integration, "org-id@inbound.example.test")).toEqual({
      action: "Reconnect",
      description: "Reconnect Gmail to grant inbox access for native receiving",
    })
  })

  it("shows native receiving as pending before watch setup", () => {
    const integration = gmailIntegration({ oauthScopes: [GMAIL_READONLY_SCOPE] })

    expect(deriveIntegrationHealth("email", [integration], null)).toEqual({
      state: "waiting",
      note: "Sending is connected. Native Gmail receiving is pending; keep forwarding enabled.",
      canFix: false,
    })
    expect(getEmailReceivingDisplay(integration, null)).toEqual({
      action: "Pending",
      description: "Native Gmail receiving is pending; keep forwarding enabled",
    })
  })

  it("shows active native receiving as healthy", () => {
    const integration = gmailIntegration({
      oauthScopes: [GMAIL_READONLY_SCOPE],
      gmail: { inboundStatus: "active" },
    })

    expect(deriveIntegrationHealth("email", [integration], null)).toEqual({
      state: "working",
      note: null,
      canFix: false,
    })
    expect(getEmailReceivingDisplay(integration, null)).toEqual({
      action: "Active",
      description: "Native Gmail inbox sync is active",
    })
  })

  it("surfaces a degraded Gmail watch without claiming the OAuth grant expired", () => {
    const integration = gmailIntegration({
      oauthScopes: [GMAIL_READONLY_SCOPE],
      gmail: { inboundStatus: "degraded" },
    })

    expect(deriveIntegrationHealth("email", [integration], null)).toEqual({
      state: "needs-attention",
      note: "Gmail inbox sync needs attention. Sending still works; keep forwarding enabled.",
      canFix: false,
    })
  })

  it("surfaces repeated Gmail watch renewal failures", () => {
    const integration = gmailIntegration({
      oauthScopes: [GMAIL_READONLY_SCOPE],
      gmail: { inboundStatus: "degraded", watchFailureCount: 3 },
    })

    expect(deriveIntegrationHealth("email", [integration], null)).toEqual({
      state: "needs-attention",
      note: "Gmail watch renewal has failed 3 times. Sending still works; keep forwarding enabled.",
      canFix: false,
    })
    expect(getEmailReceivingDisplay(integration, null)).toEqual({
      action: "Degraded",
      description: "Gmail watch renewal has failed 3 times; keep forwarding enabled",
    })
  })
})
