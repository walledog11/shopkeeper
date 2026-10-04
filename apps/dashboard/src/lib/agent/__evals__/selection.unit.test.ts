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

  it("includes runtime-v2 fixtures in the current runtime", () => {
    const v2Only = { ...fixture("placeholder-a", "core"), runtimeVersion: 2 as const }
    const all = [...fixtures, v2Only]
    expect(selectFixtures(all, "full", null).map(row => row.id)).toEqual(["core-a", "extended-a", "placeholder-a"])
    expect(selectFixtures(all, "core", null, 2).map(row => row.id)).toEqual(["core-a", "placeholder-a"])
  })

  it("runs a held-out fixture with its suite and never by name", () => {
    const heldOut = { ...fixture("holdout-a", "core"), holdout: "C05" as const }
    const all = [...fixtures, heldOut]
    expect(selectFixtures(all, "core", null).map(row => row.id)).toEqual(["core-a", "holdout-a"])
    expect(() => selectFixtures(all, "full", new Set(["core-a", "holdout-a"]))).toThrow(/held-out.*holdout-a/)
    expect(selectFixtures(all, "full", new Set(["core-a"])).map(row => row.id)).toEqual(["core-a"])
  })

  it("pins current evals to v2 and refuses a retired runtime", () => {
    expect(requestedEvalAgentRuntimeVersion(undefined)).toBe(2)
    expect(requestedEvalAgentRuntimeVersion("current")).toBe(2)
    expect(() => requestedEvalAgentRuntimeVersion(" 1 ")).toThrow(/EVAL_AGENT_RUNTIME_VERSION/)
    expect(requestedEvalAgentRuntimeVersion("2")).toBe(2)
    expect(() => requestedEvalAgentRuntimeVersion("3")).toThrow(/EVAL_AGENT_RUNTIME_VERSION/)
  })
})
