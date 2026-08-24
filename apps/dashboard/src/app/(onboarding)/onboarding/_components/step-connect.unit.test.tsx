import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { StepConnect } from "./step-connect"

describe("StepConnect", () => {
  const statusProps = {
    imessageStatus: undefined,
    onRefreshImessage: () => undefined,
  };

  it("offers iMessage when the line is configured", () => {
    const html = renderToStaticMarkup(createElement(StepConnect, {
      ...statusProps,
      imessageHandle: "+15551234567",
    }))

    expect(html).toContain("iMessage")
    expect(html).toContain("Link my iPhone")
    expect(html).not.toContain("Telegram")
  })

  it("falls back to a dashboard-only message when no channel is configured", () => {
    const html = renderToStaticMarkup(createElement(StepConnect, {
      ...statusProps,
      imessageHandle: null,
    }))

    expect(html).toContain("Messaging isn")
    expect(html).not.toContain("Link my iPhone")
  })
})
