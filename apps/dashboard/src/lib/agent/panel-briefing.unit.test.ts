import { describe, expect, it } from "vitest"
import { createEmptyHomeSummary } from "@/lib/home/summary-contract"
import {
  buildBriefingNarrativeSegments,
  buildBriefingOpsNotes,
  buildPanelSuggestionChips,
  buildThreadContextChips,
  buildThreadContextNarrative,
  briefingInputFromSummary,
  formatChannelList,
} from "./panel-briefing"

function summaryWith(overrides: Partial<ReturnType<typeof createEmptyHomeSummary>["metrics"]> = {}) {
  const summary = createEmptyHomeSummary()
  summary.metrics = { ...summary.metrics, ...overrides }
  return summary
}

describe("formatChannelList", () => {
  it("formats one, two, and many channels", () => {
    expect(formatChannelList([])).toBe("")
    expect(formatChannelList(["Email"])).toBe("Email")
    expect(formatChannelList(["Email", "Instagram"])).toBe("Email and Instagram")
    expect(formatChannelList(["Email", "Instagram", "Shopify"])).toBe("Email, Instagram, and Shopify")
  })
})

describe("buildBriefingNarrativeSegments", () => {
  it("returns calm on-duty copy when all caught up", () => {
    const segments = buildBriefingNarrativeSegments({
      needsYouCount: 0,
      overnightClearedCount: 0,
      briefingChannels: [],
      refundsPending: 0,
      vipsInQueue: 0,
      ordersToShip: null,
    })

    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ kind: "text" })
    expect((segments[0] as { value: string }).value).toContain("all caught up")
  })

  it("emphasizes pending approvals when nothing cleared overnight", () => {
    const segments = buildBriefingNarrativeSegments({
      needsYouCount: 2,
      overnightClearedCount: 0,
      briefingChannels: [],
      refundsPending: 0,
      vipsInQueue: 0,
      ordersToShip: null,
    })

    expect(segments.some(segment => segment.kind === "strong" && segment.value === "2")).toBe(true)
    expect(segments.map(segment => ("value" in segment ? segment.value : "")).join("")).toContain("2 tickets")
  })

  it("mentions overnight work and remaining approvals", () => {
    const segments = buildBriefingNarrativeSegments({
      needsYouCount: 1,
      overnightClearedCount: 3,
      briefingChannels: ["Email", "Instagram"],
      refundsPending: 0,
      vipsInQueue: 0,
      ordersToShip: null,
    })

    const text = segments.map(segment => ("value" in segment ? segment.value : "")).join("")
    expect(text).toContain("I drafted replies for")
    expect(text).toContain("Email and Instagram")
    expect(text).toContain("still needs your eye")
  })
})

describe("buildBriefingOpsNotes", () => {
  it("includes refunds, VIPs, and orders when present", () => {
    const notes = buildBriefingOpsNotes({
      needsYouCount: 0,
      overnightClearedCount: 0,
      briefingChannels: [],
      refundsPending: 2,
      vipsInQueue: 1,
      ordersToShip: 4,
    })

    expect(notes.map(note => note.id)).toEqual(["refunds", "vips", "orders"])
  })
})

describe("buildPanelSuggestionChips", () => {
  it("prioritizes walkthrough chip when approvals are pending", () => {
    const chips = buildPanelSuggestionChips(summaryWith({ needsYouCount: 2, openCount: 5 }))

    expect(chips[0]).toMatchObject({
      id: "approvals",
      autoSend: true,
      prompt: "Walk me through 2 pending approvals",
    })
  })

  it("returns no chips when queue is clear", () => {
    const chips = buildPanelSuggestionChips(summaryWith())

    expect(chips).toHaveLength(0)
  })

  it("includes all live-state chips without generic fallbacks", () => {
    const chips = buildPanelSuggestionChips(summaryWith({
      needsYouCount: 1,
      openCount: 3,
      refundsPending: 2,
    }))

    expect(chips).toHaveLength(3)
    expect(chips.map(chip => chip.id)).toEqual(["approvals", "open-tickets", "refunds"])
  })
})

describe("briefingInputFromSummary", () => {
  it("maps summary metrics and overnight channels", () => {
    const summary = createEmptyHomeSummary()
    summary.metrics.needsYouCount = 2
    summary.metrics.overnightClearedCount = 5
    summary.overnight.channelNames = ["Email"]
    summary.metrics.refundsPending = 1

    expect(briefingInputFromSummary(summary, 3)).toEqual({
      needsYouCount: 2,
      overnightClearedCount: 5,
      briefingChannels: ["Email"],
      refundsPending: 1,
      vipsInQueue: 0,
      ordersToShip: 3,
    })
  })
})

describe("thread context briefing", () => {
  it("names the customer in the narrative and chips when available", () => {
    const context = { threadId: "thread-1", customerName: "Sarah" }

    expect(buildThreadContextNarrative(context).map(segment => segment.value).join("")).toContain("Sarah")
    expect(buildThreadContextChips(context)[0]).toMatchObject({
      label: "Draft a reply to Sarah",
      autoSend: true,
    })
  })

  it("falls back to generic ticket copy without a customer name", () => {
    const context = { threadId: "thread-1" }

    expect(buildThreadContextNarrative(context)[0]).toMatchObject({
      value: "You're on this ticket — want me to draft a reply?",
    })
    expect(buildThreadContextChips(context)[0].label).toBe("Draft a reply")
  })
})
