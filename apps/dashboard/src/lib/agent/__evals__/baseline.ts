import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type {
  CategoryScore,
  EvalBaseline,
  Fixture,
  FixtureRunSummary,
  FixtureScore,
  GateScore,
  GateSummary,
} from "./types"

const CATEGORY_PREFIXES = [
  "address-change",
  "brand-voice",
  "cancel",
  "escalate",
  "exchange",
  "gift-card",
  "kb",
  "memory",
  "multi-step",
  "no-tool",
  "operator",
  "order-status",
  "prompt-injection",
  "quick-reply",
  "refund",
  "return-label",
  "sample-reply",
  "store-credit",
  "tier",
]
const BASELINE_PATH = join(__dirname, "baseline.json")
const DEFAULT_REGRESSION_THRESHOLD = 0.05
const DEFAULT_EVAL_REPEATS = 1

function categoryOf(id: string): string {
  return CATEGORY_PREFIXES.find(prefix => id === prefix || id.startsWith(`${prefix}-`)) ?? id
}

export function summarizeResults(summaries: readonly FixtureRunSummary[]): EvalBaseline {
  const categories: Record<string, CategoryScore> = {}
  const fixtures: Record<string, FixtureScore> = {}
  for (const summary of summaries) {
    const category = categoryOf(summary.id)
    const score = categories[category] ?? { total: 0, passed: 0, passRate: 0 }
    score.total += summary.repeats
    score.passed += summary.passes
    score.passRate = score.passed / score.total
    categories[category] = score
    fixtures[summary.id] = {
      repeats: summary.repeats,
      passes: summary.passes,
      passRate: summary.passRate,
    }
  }
  const total = summaries.reduce((sum, summary) => sum + summary.repeats, 0)
  const passed = summaries.reduce((sum, summary) => sum + summary.passes, 0)
  return {
    generatedAt: new Date().toISOString(),
    repeats: summaries.reduce((max, summary) => Math.max(max, summary.repeats), 1),
    total,
    passed,
    passRate: total === 0 ? 0 : passed / total,
    categories: Object.fromEntries(Object.keys(categories).sort().map(key => [key, categories[key]])),
    fixtures: Object.fromEntries(Object.keys(fixtures).sort().map(key => [key, fixtures[key]])),
  }
}

function emptyGateScore(): GateScore {
  return { fixtureCount: 0, total: 0, passed: 0, passRate: 0 }
}

export function summarizeGates(
  summaries: readonly FixtureRunSummary[],
  fixtures: readonly Pick<Fixture, "id" | "advisory">[],
): GateSummary {
  const advisoryIds = new Set(
    fixtures.filter(fixture => fixture.advisory === true).map(fixture => fixture.id),
  )
  const hardGated = emptyGateScore()
  const advisory = emptyGateScore()
  for (const summary of summaries) {
    const bucket = advisoryIds.has(summary.id) ? advisory : hardGated
    bucket.fixtureCount += 1
    bucket.total += summary.repeats
    bucket.passed += summary.passes
  }
  for (const bucket of [hardGated, advisory]) {
    bucket.passRate = bucket.total === 0 ? 0 : bucket.passed / bucket.total
  }
  return { hardGated, advisory }
}

export function formatGateSummary(gates: GateSummary): string {
  const part = (label: string, score: GateScore) =>
    `${label} ${score.passed}/${score.total} (${(score.passRate * 100).toFixed(1)}%)`
  return `[eval:gates] ${part("hard-gated", gates.hardGated)} | ${part("advisory", gates.advisory)}`
}

export function formatSummary(summary: EvalBaseline): string {
  const lines = [
    `[eval:summary] aggregate ${summary.passed}/${summary.total} (${(summary.passRate * 100).toFixed(1)}%) over ${summary.repeats} repeat(s)/fixture`,
  ]
  for (const [category, score] of Object.entries(summary.categories)) {
    lines.push(`  ${category}: ${score.passed}/${score.total} (${(score.passRate * 100).toFixed(1)}%)`)
  }
  if (summary.repeats > 1) {
    for (const [id, fixture] of Object.entries(summary.fixtures).filter(
      ([, score]) => score.passRate > 0 && score.passRate < 1,
    )) {
      lines.push(`  ~ flappy ${id}: ${fixture.passes}/${fixture.repeats} (${(fixture.passRate * 100).toFixed(1)}%)`)
    }
  }
  return lines.join("\n")
}

export function shouldUpdateBaseline(): boolean {
  const flag = process.env.UPDATE_EVAL_BASELINE
  if (flag === undefined) return false
  const normalized = flag.trim().toLowerCase()
  return normalized !== "" && normalized !== "0" && normalized !== "false"
}

export function regressionThreshold(): number {
  const parsed = Number(process.env.EVAL_BASELINE_THRESHOLD)
  return Number.isFinite(parsed) ? parsed : DEFAULT_REGRESSION_THRESHOLD
}

export function evalRepeats(): number {
  const parsed = Number(process.env.EVAL_REPEATS)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_EVAL_REPEATS
  return Math.floor(parsed)
}

export function writeBaseline(summary: EvalBaseline): void {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(summary, null, 2)}\n`)
}

export function loadBaseline(): EvalBaseline | null {
  if (!existsSync(BASELINE_PATH)) return null
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as EvalBaseline
}

export function compareToBaseline(
  current: EvalBaseline,
  baseline: EvalBaseline,
  threshold: number,
): { aggregate: string | null; categories: string[]; fixtures: string[] } {
  const drop = (value: number, base: number) =>
    `${(value * 100).toFixed(1)}% dropped > ${(threshold * 100).toFixed(1)} pts below baseline ${(base * 100).toFixed(1)}%`
  const aggregate = current.passRate < baseline.passRate - threshold
    ? `aggregate pass rate ${drop(current.passRate, baseline.passRate)}`
    : null
  const categories: string[] = []
  for (const [category, baseScore] of Object.entries(baseline.categories)) {
    const score = current.categories[category]
    if (score && score.passRate < baseScore.passRate - threshold) {
      categories.push(`category "${category}" pass rate ${drop(score.passRate, baseScore.passRate)}`)
    }
  }
  const fixtures: string[] = []
  for (const [id, baseScore] of Object.entries(baseline.fixtures ?? {})) {
    const score = current.fixtures[id]
    if (score && score.passRate < baseScore.passRate - threshold) {
      fixtures.push(`fixture "${id}" pass rate ${drop(score.passRate, baseScore.passRate)}`)
    }
  }
  return { aggregate, categories, fixtures }
}
