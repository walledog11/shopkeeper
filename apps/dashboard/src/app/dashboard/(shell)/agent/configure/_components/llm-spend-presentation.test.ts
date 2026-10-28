import { describe, expect, it } from "vitest"
import { presentLlmSpend } from "./llm-spend-presentation"

const snapshot = { day: "2026-09-09", defaultCapUsd: 20, spentUsd: 4, resetAt: "2026-09-10T00:00:00.000Z" }

describe("presentLlmSpend", () => {
  it("shows remaining spend below the warning threshold", () => {
    expect(presentLlmSpend(snapshot, 20)).toMatchObject({
      summary: "$4.00 used of $20.00 today",
      state: "available",
    })
  })

  it("warns near the cap and pauses at the cap", () => {
    expect(presentLlmSpend({ ...snapshot, spentUsd: 16 }, 20).state).toBe("warning")
    expect(presentLlmSpend({ ...snapshot, spentUsd: 20 }, 20)).toMatchObject({ state: "paused" })
  })

  it("explains fail-closed accounting outages", () => {
    expect(presentLlmSpend({ ...snapshot, spentUsd: null }, 20)).toEqual({
      summary: "Usage temporarily unavailable",
      detail: "New AI work pauses when usage cannot be read. Manual handling remains available.",
      state: "unavailable",
    })
  })
})
