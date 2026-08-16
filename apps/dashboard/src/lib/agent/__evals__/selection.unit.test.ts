import { describe, expect, it } from "vitest"
import { requestedEvalSuite, requestedFixtureIds, selectFixtures } from "./selection"
import type { Fixture } from "./types"

function fixture(id: string, suite: "core" | "extended"): Fixture {
  return {
    id,
    description: id,
    suite,
    setup: { channelType: "email", messages: [] },
    instruction: "test",
    expectedPlan: {},
  }
}

describe("eval selection", () => {
  const fixtures = [fixture("core-a", "core"), fixture("extended-a", "extended")]

  it("defaults to the full suite without a fixture filter", () => {
    expect(requestedEvalSuite(undefined)).toBe("full")
    expect(requestedFixtureIds(undefined)).toBeNull()
    expect(selectFixtures(fixtures, "full", null)).toEqual(fixtures)
  })

  it("selects named fixtures for a cheap targeted probe", () => {
    const requested = requestedFixtureIds(" extended-a, core-a ")
    expect(selectFixtures(fixtures, "full", requested).map(row => row.id)).toEqual([
      "core-a",
      "extended-a",
    ])
  })

  it("rejects unknown and out-of-suite fixture names", () => {
    expect(() => selectFixtures(fixtures, "full", new Set(["missing"]))).toThrow(/missing/)
    expect(() => selectFixtures(fixtures, "core", new Set(["extended-a"]))).toThrow(/extended-a/)
  })
})
