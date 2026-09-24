import type { Fixture } from "./types"

export type EvalSuite = "core" | "full"
export type EvalAgentRuntimeVersion = 1 | 2

export function requestedEvalSuite(value: string | undefined = process.env.EVAL_SUITE): EvalSuite {
  const normalized = value?.trim().toLowerCase() ?? "full"
  if (normalized !== "core" && normalized !== "full") {
    throw new Error(`Invalid EVAL_SUITE ${JSON.stringify(normalized)}`)
  }
  return normalized
}

/**
 * Pins a paid comparison run to the same runtime choice that production stores
 * on a newly-created task. Unset/"current" preserves the pre-Package-6 eval
 * behavior so ordinary release gates do not silently change semantics.
 */
export function requestedEvalAgentRuntimeVersion(
  value: string | undefined = process.env.EVAL_AGENT_RUNTIME_VERSION,
): EvalAgentRuntimeVersion | undefined {
  const normalized = value?.trim().toLowerCase()
  if (normalized === undefined || normalized === "" || normalized === "current") {
    return undefined
  }
  if (normalized === "1") return 1
  if (normalized === "2") return 2
  throw new Error(`Invalid EVAL_AGENT_RUNTIME_VERSION ${JSON.stringify(normalized)}`)
}

/**
 * Whether live-model eval files may spend.
 *
 * The `include` glob in both `vitest.integration.config.ts` and
 * `vitest.config.ts` matches every non-unit test file, this one included, and
 * `with-test-env.mjs` supplies a real key out of `.env.local` even when the
 * shell has none — so without this gate a bare `npm run test:integration`, or
 * `verify:pr` by way of coverage, silently bills a full suite. Opting in is
 * explicit: the `test:evals*` scripts set `EVAL_RUN=1`, and the eval workflows
 * set `REQUIRE_MODEL_EVALS=1`.
 */
export function evalsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.EVAL_RUN === "1" || env.REQUIRE_MODEL_EVALS === "1"
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
