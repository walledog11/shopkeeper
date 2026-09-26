import { describe, expect, it } from "vitest"
import {
  requestedEvalAgentRuntimeVersion,
  requestedEvalSuite,
  requestedFixtureIds,
  selectFixtures,
} from "./selection"
import type { Fixture } from "./types"

function fixture(id: string, suite: "core" | "extended"): Fixture {
  return {
    id,
    description: id,
    whyModelNeeded: "test",
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

  it("runs a runtime-v2 fixture only when runtime v2 is pinned", () => {
    const v2Only = { ...fixture("placeholder-a", "core"), runtimeVersion: 2 as const }
    const all = [...fixtures, v2Only]
    expect(selectFixtures(all, "full", null, undefined).map(row => row.id)).toEqual(["core-a", "extended-a"])
    expect(selectFixtures(all, "full", null, 1).map(row => row.id)).toEqual(["core-a", "extended-a"])
    expect(selectFixtures(all, "core", null, 2).map(row => row.id)).toEqual(["core-a", "placeholder-a"])
    expect(() => selectFixtures(all, "full", new Set(["placeholder-a"]), 1)).toThrow(/placeholder-a/)
  })

  it("parses an explicit comparison runtime without changing the default", () => {
    expect(requestedEvalAgentRuntimeVersion(undefined)).toBeUndefined()
    expect(requestedEvalAgentRuntimeVersion("current")).toBeUndefined()
    expect(requestedEvalAgentRuntimeVersion(" 1 ")).toBe(1)
    expect(requestedEvalAgentRuntimeVersion("2")).toBe(2)
    expect(() => requestedEvalAgentRuntimeVersion("3")).toThrow(/EVAL_AGENT_RUNTIME_VERSION/)
  })
})
