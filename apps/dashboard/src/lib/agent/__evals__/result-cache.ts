import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { isJudgeEnabled } from "./fixture-runtime"
import type { Fixture, FixtureRunSummary } from "./types"

function cachePath(fixture: Fixture, repeats: number): string | null {
  const directory = process.env.EVAL_RESULT_CACHE_DIR?.trim()
  if (!directory || process.env.UPDATE_EVAL_BASELINE === "1") return null
  const judgeMode = isJudgeEnabled() ? "all-judges" : "gated-judges"
  return join(directory, `${fixture.id}.r${repeats}.${judgeMode}.json`)
}

export function readCachedPassingSummary(
  fixture: Fixture,
  repeats: number,
): FixtureRunSummary | null {
  const path = cachePath(fixture, repeats)
  if (!path || !existsSync(path)) return null
  try {
    const cached = JSON.parse(readFileSync(path, "utf8")) as {
      requestedRepeats: number
      summary: FixtureRunSummary
    }
    const summary = cached.summary
    if (
      cached.requestedRepeats !== repeats
      ||
      summary.id !== fixture.id
      || summary.passes !== summary.repeats
      || !Array.isArray(summary.results)
      || summary.results.length !== summary.repeats
      || summary.results.some(result => result.pass !== true)
    ) return null
    return summary
  } catch {
    return null
  }
}

export function writePassingSummary(
  fixture: Fixture,
  repeats: number,
  summary: FixtureRunSummary,
): void {
  if (summary.passes !== summary.repeats) return
  const path = cachePath(fixture, repeats)
  if (!path) return
  mkdirSync(process.env.EVAL_RESULT_CACHE_DIR!, { recursive: true })
  writeFileSync(path, `${JSON.stringify({ requestedRepeats: repeats, summary })}\n`)
}
