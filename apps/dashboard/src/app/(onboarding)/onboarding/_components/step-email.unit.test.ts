import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { StepEmail } from "./step-email"
import { DEFAULT_DATA } from "./model"

vi.mock("@/components/integrations/EmailForwardingDisclosure", () => ({
  EmailForwardingSetupPanel: () => createElement("div", { "data-testid": "forwarding-panel" }, "Forwarding panel"),
}))

describe("StepEmail", () => {
  it("renders forwarding-first setup instead of channel cards", () => {
    const html = renderToStaticMarkup(createElement(StepEmail, {
      data: DEFAULT_DATA,
      update: vi.fn(),
      emailConnected: false,
      orgReady: true,
      orgLoading: false,
      orgError: false,
      onRetryOrg: vi.fn(),
      emailSaving: false,
      onSaveEmail: vi.fn(),
      onOAuth: vi.fn(),
    }))

    expect(html).toContain("Forward your support inbox to me")
    expect(html).toContain("Forwarding panel")
    expect(html).toContain("Connect Gmail or Outlook instead")
    expect(html).toContain("add later in Integrations")
    expect(html).not.toContain("Instagram DM")
  })

  it("shows loading state while the workspace is being prepared", () => {
    const html = renderToStaticMarkup(createElement(StepEmail, {
      data: DEFAULT_DATA,
      update: vi.fn(),
      emailConnected: false,
      orgReady: false,
      orgLoading: true,
      orgError: false,
      onRetryOrg: vi.fn(),
      emailSaving: false,
      onSaveEmail: vi.fn(),
      onOAuth: vi.fn(),
    }))

    expect(html).toContain("Preparing your inbox address")
    expect(html).not.toContain("Forwarding panel")
  })
})
