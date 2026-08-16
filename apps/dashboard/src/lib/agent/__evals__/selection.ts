import type { Fixture } from "./types"

export type EvalSuite = "core" | "full"

export function requestedEvalSuite(value: string | undefined = process.env.EVAL_SUITE): EvalSuite {
  const normalized = value?.trim().toLowerCase() ?? "full"
  if (normalized !== "core" && normalized !== "full") {
    throw new Error(`Invalid EVAL_SUITE ${JSON.stringify(normalized)}`)
  }
  return normalized
}

export function requestedFixtureIds(
  value: string | undefined = process.env.EVAL_FIXTURE,
): Set<string> | null {
  if (value === undefined) return null
  const ids = value.split(",").map(id => id.trim()).filter(Boolean)
  if (ids.length === 0) throw new Error("EVAL_FIXTURE must name at least one fixture")
  return new Set(ids)
}

export function selectFixtures(
  fixtures: readonly Fixture[],
  suite: EvalSuite,
  requested: ReadonlySet<string> | null,
): Fixture[] {
  const inSuite = suite === "core"
    ? fixtures.filter(fixture => fixture.suite === "core")
    : [...fixtures]
  if (!requested) return inSuite

  const selected = inSuite.filter(fixture => requested.has(fixture.id))
  const selectedIds = new Set(selected.map(fixture => fixture.id))
  const missing = [...requested].filter(id => !selectedIds.has(id))
  if (missing.length > 0) {
    throw new Error(
      `EVAL_FIXTURE selected unknown or out-of-suite fixture(s): ${missing.join(", ")}`,
    )
  }
  return selected
}
