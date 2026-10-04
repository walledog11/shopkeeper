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
 * Pins evals to the sole executable runtime. Historical v1 comparisons belong
 * to the deployment revision that still implements v1.
 */
export function requestedEvalAgentRuntimeVersion(
  value: string | undefined = process.env.EVAL_AGENT_RUNTIME_VERSION,
): 2 {
  const normalized = value?.trim().toLowerCase()
  if (normalized === undefined || normalized === "" || normalized === "current") {
    return 2
  }
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
  runtimeVersion: 2 = requestedEvalAgentRuntimeVersion(),
): Fixture[] {
  // A fixture for behavior only one runtime has, such as a receipt placeholder
  // in an exact draft, runs only when that runtime is pinned.
  const onRuntime = fixtures.filter(fixture => (
    fixture.runtimeVersion === undefined || fixture.runtimeVersion === runtimeVersion
  ))
  const inSuite = suite === "core"
    ? onRuntime.filter(fixture => fixture.suite === "core")
    : onRuntime
  if (!requested) return inSuite

  // Rerunning a held-out case by name to see whether a change fixed it is how
  // its input ends up tuning the prompt. It runs only with its whole suite.
  const heldOut = inSuite.filter(fixture => fixture.holdout && requested.has(fixture.id))
  if (heldOut.length > 0) {
    throw new Error(
      `EVAL_FIXTURE named held-out fixture(s): ${heldOut.map(fixture => fixture.id).join(", ")}; `
      + "they run only in a whole-suite comparison",
    )
  }

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
