import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { StepConnect } from "./step-connect"

describe("StepConnect", () => {
  it("offers iMessage and Telegram when both are configured", () => {
    const html = renderToStaticMarkup(createElement(StepConnect, {
      telegramBotUsername: "ShopkeeperBot",
      imessageHandle: "+15551234567",
    }))

    expect(html).toContain("iMessage")
    expect(html).toContain("Telegram")
    expect(html).toContain("Link my iPhone")
    expect(html).toContain("Link Telegram")
  })

  it("hides Telegram when only the iMessage line is configured", () => {
    const html = renderToStaticMarkup(createElement(StepConnect, {
      telegramBotUsername: null,
      imessageHandle: "+15551234567",
    }))

    expect(html).toContain("iMessage")
    expect(html).not.toContain("Link Telegram")
  })

  it("falls back to a dashboard-only message when no channel is configured", () => {
    const html = renderToStaticMarkup(createElement(StepConnect, {
      telegramBotUsername: null,
      imessageHandle: null,
    }))

    expect(html).toContain("Messaging isn")
    expect(html).not.toContain("Link my iPhone")
  })
})
