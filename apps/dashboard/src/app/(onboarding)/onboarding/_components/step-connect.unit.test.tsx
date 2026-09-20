import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { StepConnect } from "./step-connect"

vi.mock("@/hooks/useOperatorChannels", () => ({
  useOperatorChannels: () => ({
    imessage: undefined,
    telegram: undefined,
    refreshImessage: () => undefined,
    refreshTelegram: () => undefined,
    anyBound: false,
  }),
}));

describe("StepConnect", () => {
  it("offers iMessage when the line is configured", () => {
    const html = renderToStaticMarkup(createElement(StepConnect, {
      imessageHandle: "+15551234567",
    }))

    expect(html).toContain("iMessage")
    expect(html).toContain("Link my iPhone")
  })

  it("holds the dashboard-only fallback back until channel status is known", () => {
    const html = renderToStaticMarkup(createElement(StepConnect, {
      imessageHandle: null,
    }))

    expect(html).not.toContain("Messaging isn")
    expect(html).not.toContain("Link my iPhone")
  })
})
