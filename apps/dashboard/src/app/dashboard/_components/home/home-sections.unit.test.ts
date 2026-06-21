import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import ClearedOvernight from "./ClearedOvernight"
import NeedsYou from "./NeedsYou"

describe("home summary sections", () => {
  it("shows an all-clear state when nothing needs attention", () => {
    const needsYou = renderToStaticMarkup(createElement(NeedsYou, {
      items: [],
      agentName: "Shopkeeper",
      onApproved: vi.fn(),
    }))

    expect(needsYou).toContain("You&#x27;re all caught up")
    expect(needsYou).toContain("Shopkeeper will surface anything that needs your eye here.")
  })

  it("shows a skeleton while needs-you cards are loading", () => {
    const needsYou = renderToStaticMarkup(createElement(NeedsYou, {
      items: [],
      agentName: "Shopkeeper",
      isLoading: true,
      onApproved: vi.fn(),
    }))

    expect(needsYou).toContain("aria-busy=\"true\"")
    expect(needsYou).toContain("Loading action plan cards")
    expect(needsYou).not.toContain("You&#x27;re all caught up")
  })

  it("does not render cleared overnight when there is nothing to show", () => {
    expect(renderToStaticMarkup(createElement(ClearedOvernight, {
      agentName: "Shopkeeper",
      totalCount: 0,
      topics: [],
      timeSavedHours: 0,
      repliesSent: 0,
    }))).toBe("")
  })
})
