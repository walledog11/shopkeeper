import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { StepEmail } from "./step-email"
import { DEFAULT_DATA } from "./model"

vi.mock("@/components/integrations/EmailForwardingDisclosure", () => ({
  EmailForwardingSetupPanel: () => createElement("div", { "data-testid": "forwarding-panel" }, "Forwarding panel"),
}))

describe("StepEmail", () => {
  it("puts Gmail first and marks social channels as coming soon", () => {
    const html = renderToStaticMarkup(createElement(StepEmail, {
      data: DEFAULT_DATA,
      update: vi.fn(),
      emailConnected: false,
      emailIntegration: undefined,
      orgReady: true,
      orgLoading: false,
      orgError: false,
      onRetryOrg: vi.fn(),
      emailSaving: false,
      onSaveEmail: vi.fn(),
      onOAuth: vi.fn(),
    }))

    expect(html).toContain("Where do customers reach you?")
    expect(html).toContain("Connect Gmail")
    expect(html).toContain("Forward another inbox")
    expect(html).toContain("Instagram")
    expect(html).toContain("TikTok")
    expect(html).toContain("coming soon")
    expect(html).not.toContain("Forwarding panel")
  })

  it("shows which direct email provider is connected", () => {
    const html = renderToStaticMarkup(createElement(StepEmail, {
      data: { ...DEFAULT_DATA, primaryEmail: "support@example.com" },
      update: vi.fn(),
      emailConnected: true,
      emailIntegration: {
        id: "gmail-integration",
        platform: "email",
        externalAccountId: "support@example.com",
        fromEmail: "support@example.com",
        metadata: { provider: "gmail" },
      },
      orgReady: true,
      orgLoading: false,
      orgError: false,
      onRetryOrg: vi.fn(),
      emailSaving: false,
      onSaveEmail: vi.fn(),
      onOAuth: vi.fn(),
    }))

    expect(html).toContain("Email connected")
    expect(html).toContain("support@example.com")
    expect(html).toContain("Address customers email")
    expect(html).toContain("send-as address in your Google Workspace Gmail settings")
    expect(html).toContain("Reconnect Gmail")
  })
})
