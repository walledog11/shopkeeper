import { describe, expect, it } from "vitest"
import { GMAIL_READONLY_SCOPE } from "@shopkeeper/email/providers"
import type { Integration } from "@/types"
import {
  deriveGmailConfigureScene,
  gmailConfigureStatusLine,
  isGmailWorkspaceAccount,
  needsGmailForwardingSetup,
  usesCustomReplyAddress,
} from "./gmail-configure-state"

function gmailIntegration(overrides: Partial<Integration> & { metadata?: Record<string, unknown> }): Integration {
  const { metadata, ...rest } = overrides
  return {
    id: "gmail-integration",
    organizationId: "org-id",
    platform: "email",
    externalAccountId: "merchant@gmail.test",
    fromEmail: "merchant@gmail.test",
    tokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    metadata: { provider: "gmail", ...metadata },
    createdAt: new Date().toISOString(),
    ...rest,
  }
}

describe("deriveGmailConfigureScene", () => {
  it("shows reconnect when OAuth needs attention", () => {
    const integration = gmailIntegration({
      metadata: { oauthScopes: ["https://www.googleapis.com/auth/gmail.send"] },
    })

    expect(deriveGmailConfigureScene(integration, null, true, {
      state: "needs-attention",
      note: "Reconnect Gmail to grant inbox access for native receiving.",
      canFix: true,
    })).toBe("needs_reconnect")
  })

  it("shows forwarding setup when mail has not arrived yet", () => {
    const integration = gmailIntegration({
      metadata: { oauthScopes: [GMAIL_READONLY_SCOPE] },
    })

    expect(deriveGmailConfigureScene(integration, null, false, {
      state: "working",
      note: null,
      canFix: false,
    })).toBe("needs_forwarding")
    expect(needsGmailForwardingSetup(integration, null, false)).toBe(true)
  })

  it("shows ready when native inbound is active", () => {
    const integration = gmailIntegration({
      metadata: {
        oauthScopes: [GMAIL_READONLY_SCOPE],
        gmail: { inboundStatus: "active" },
      },
    })

    expect(deriveGmailConfigureScene(integration, null, true, {
      state: "working",
      note: null,
      canFix: false,
    })).toBe("ready")
  })

  it("shows ready when forwarded mail has arrived", () => {
    const integration = gmailIntegration({
      metadata: { oauthScopes: [GMAIL_READONLY_SCOPE] },
    })

    expect(deriveGmailConfigureScene(integration, new Date().toISOString(), false, {
      state: "working",
      note: null,
      canFix: false,
    })).toBe("ready")
  })
})

describe("usesCustomReplyAddress", () => {
  it("detects a saved alias", () => {
    expect(usesCustomReplyAddress(gmailIntegration({
      fromEmail: "support@merchant.test",
    }))).toBe(true)
  })

  it("treats the Google account address as the default", () => {
    expect(usesCustomReplyAddress(gmailIntegration({
      fromEmail: "merchant@gmail.test",
    }))).toBe(false)
  })
})

describe("gmailConfigureStatusLine", () => {
  it("prompts forwarding setup in plain language", () => {
    const integration = gmailIntegration({})

    expect(gmailConfigureStatusLine("needs_forwarding", integration, null, {
      state: "working",
      note: null,
      canFix: false,
    })).toBe("Forward mail sent to merchant@gmail.test to finish setup.")
  })
})

describe("isGmailWorkspaceAccount", () => {
  it("treats @gmail.com accounts as personal", () => {
    expect(isGmailWorkspaceAccount(gmailIntegration({
      metadata: { gmail: { accountType: "personal" } },
    }))).toBe(false)
  })

  it("treats custom domains as workspace", () => {
    expect(isGmailWorkspaceAccount(gmailIntegration({
      externalAccountId: "owner@merchant.test",
      metadata: { gmail: { accountType: "workspace", hostedDomain: "merchant.test" } },
    }))).toBe(true)
  })
})
