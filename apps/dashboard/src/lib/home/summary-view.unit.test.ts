import { describe, expect, it } from "vitest"
import { createEmptyHomeSummary } from "@/lib/home/summary-contract"
import { buildHomeSummaryView } from "@/lib/home/summary-view"

describe("home summary view", () => {
  it("produces complete empty-state data", () => {
    const summary = createEmptyHomeSummary(new Date("2026-06-04T18:00:00.000Z"))
    const view = buildHomeSummaryView(summary)

    expect(view).toMatchObject({
      openCount: 0,
      openDelta: 0,
      weeklyVolume: 0,
      repliesSent24h: 0,
      needsYouItems: [],
      clearedTopics: [],
      briefingChannels: [],
      repeatCustomers: [],
      timeSavedHours: 0,
    })
  })

  it("maps metrics into the home presentation", () => {
    const summary = createEmptyHomeSummary(new Date("2026-06-04T18:00:00.000Z"))
    summary.metrics.overnightClearedCount = 3
    summary.metrics.openCount = 8

    const view = buildHomeSummaryView(summary)

    expect(view.openCount).toBe(8)
    expect(view.timeSavedHours).toBeCloseTo(0.7)
  })
})
