import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { StepEmail } from "./step-email"
import { DEFAULT_DATA } from "./model"

vi.mock("@/components/integrations/EmailForwardingDisclosure", () => ({
  EmailForwardingSetupPanel: () => createElement("div", { "data-testid": "forwarding-panel" }, "Forwarding panel"),
}))

describe("StepEmail", () => {
  it("puts Gmail first and points to additional integrations", () => {
    const html = renderToStaticMarkup(createElement(StepEmail, {
      data: DEFAULT_DATA,
      update: vi.fn(),
      emailConnected: false,
      forwardingIntegration: undefined,
      gmailIntegration: undefined,
      orgReady: true,
      orgLoading: false,
      orgError: false,
      onRetryOrg: vi.fn(),
      emailSaving: false,
      oauthPending: false,
      onSaveForwarding: vi.fn(),
      onSaveGmail: vi.fn(),
      onOAuth: vi.fn(),
    }))

    expect(html).toContain("Where do customers reach you?")
    expect(html).toContain("Connect Gmail")
    expect(html).toContain("Forward another inbox")
    expect(html).toContain("Instagram")
    expect(html).toContain("other channels")
    expect(html).toContain("Integrations")
    expect(html).not.toContain("Forwarding panel")
  })

  it("shows which direct email provider is connected", () => {
    const html = renderToStaticMarkup(createElement(StepEmail, {
      data: { ...DEFAULT_DATA, primaryEmail: "support@example.com" },
      update: vi.fn(),
      emailConnected: true,
      forwardingIntegration: undefined,
      gmailIntegration: {
        id: "gmail-integration",
        organizationId: "org-1",
        platform: "email",
        emailProvider: "gmail",
        externalAccountId: "support@example.com",
        fromEmail: "support@example.com",
        tokenExpiresAt: null,
        metadata: { provider: "gmail" },
        createdAt: "2026-08-07T00:00:00.000Z",
      },
      orgReady: true,
      orgLoading: false,
      orgError: false,
      onRetryOrg: vi.fn(),
      emailSaving: false,
      oauthPending: false,
      onSaveForwarding: vi.fn(),
      onSaveGmail: vi.fn(),
      onOAuth: vi.fn(),
    }))

    expect(html).toContain("Email connected")
    expect(html).toContain("support@example.com")
    expect(html).toContain("Address customers email")
    expect(html).toContain("send-as address in your Google Workspace Gmail settings")
    expect(html).toContain("Reconnect Gmail")
  })
})
