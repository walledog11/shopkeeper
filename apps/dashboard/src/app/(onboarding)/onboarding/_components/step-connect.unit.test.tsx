import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { StepConnect } from "./step-connect"

describe("StepConnect", () => {
  const statusProps = {
    imessageStatus: undefined,
    onRefreshImessage: () => undefined,
    onRefreshTelegram: () => undefined,
    telegramStatus: undefined,
  };

  it("offers iMessage and Telegram when both are configured", () => {
    const html = renderToStaticMarkup(createElement(StepConnect, {
      ...statusProps,
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
      ...statusProps,
      telegramBotUsername: null,
      imessageHandle: "+15551234567",
    }))

    expect(html).toContain("iMessage")
    expect(html).not.toContain("Link Telegram")
  })

  it("hides iMessage when only Telegram is configured", () => {
    const html = renderToStaticMarkup(createElement(StepConnect, {
      ...statusProps,
      telegramBotUsername: "ShopkeeperBot",
      imessageHandle: null,
    }))

    expect(html).toContain("Telegram")
    expect(html).not.toContain("Link my iPhone")
  })

  it("falls back to a dashboard-only message when no channel is configured", () => {
    const html = renderToStaticMarkup(createElement(StepConnect, {
      ...statusProps,
      telegramBotUsername: null,
      imessageHandle: null,
    }))

    expect(html).toContain("Messaging isn")
    expect(html).not.toContain("Link my iPhone")
  })
})
