import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import ClearedOvernight from "./ClearedOvernight"
import NeedsYou from "./NeedsYou"

describe("home summary sections", () => {
  it("does not render empty bounded-list sections", () => {
    expect(renderToStaticMarkup(createElement(NeedsYou, {
      items: [],
      agentName: "Clerk",
      onApproved: vi.fn(),
    }))).toBe("")
    expect(renderToStaticMarkup(createElement(ClearedOvernight, {
      agentName: "Clerk",
      totalCount: 0,
      topics: [],
      timeSavedHours: 0,
      repliesSent: 0,
    }))).toBe("")
  })
})
