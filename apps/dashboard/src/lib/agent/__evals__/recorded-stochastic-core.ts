import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Fixture } from "./types"

const RECORD_PATH = join(__dirname, "recorded-stochastic-core-fixtures.json")

export function loadRecordedStochasticCoreFixtureIds(): string[] {
  const parsed = JSON.parse(readFileSync(RECORD_PATH, "utf8")) as { fixtureIds?: unknown }
  if (!Array.isArray(parsed.fixtureIds) || parsed.fixtureIds.some(id => typeof id !== "string")) {
    throw new Error("recorded-stochastic-core-fixtures.json must list string fixtureIds")
  }
  return [...parsed.fixtureIds].sort()
}

export function assertRecordedStochasticCoreFixtures(fixtures: readonly Fixture[]): void {
  const recorded = new Set(loadRecordedStochasticCoreFixtureIds())
  const flagged = fixtures.filter(fixture => fixture.stochasticRelease === true).map(fixture => fixture.id).sort()
  const flaggedSet = new Set(flagged)
  const missingFlag = [...recorded].filter(id => !flaggedSet.has(id))
  const extraFlag = flagged.filter(id => !recorded.has(id))
  if (missingFlag.length > 0 || extraFlag.length > 0) {
    throw new Error(
      "recorded-stochastic-core-fixtures.json must match fixtures with stochasticRelease: "
      + `missing flag on ${missingFlag.join(", ") || "none"}; `
      + `unexpected flag on ${extraFlag.join(", ") || "none"}`,
    )
  }
}
