import { summarizeUsage } from "./usage"
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
  "adjacent",
  "brand-voice",
  "cancel",
  "escalate",
  "exchange",
  "fulfill",
  "gift-card",
  "kb",
  "memory",
  "merchant-preference",
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
const DEFAULT_EVAL_REPEATS = 1

function categoryOf(id: string): string {
  return CATEGORY_PREFIXES.find(prefix => id === prefix || id.startsWith(`${prefix}-`)) ?? id
}

function isSoftGatedFixture(fixture: Pick<Fixture, "advisory" | "stochasticRelease">): boolean {
  return fixture.advisory === true || fixture.stochasticRelease === true
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
    usage: summarizeUsage(summaries),
    categories: Object.fromEntries(Object.keys(categories).sort().map(key => [key, categories[key]])),
    fixtures: Object.fromEntries(Object.keys(fixtures).sort().map(key => [key, fixtures[key]])),
  }
}

function emptyGateScore(): GateScore {
  return { fixtureCount: 0, total: 0, passed: 0, passRate: 0 }
}

export function summarizeGates(
  summaries: readonly FixtureRunSummary[],
  fixtures: readonly Pick<Fixture, "id" | "advisory" | "stochasticRelease">[],
): GateSummary {
  const softIds = new Set(
    fixtures.filter(fixture => isSoftGatedFixture(fixture)).map(fixture => fixture.id),
  )
  const hardGated = emptyGateScore()
  const advisory = emptyGateScore()
  for (const summary of summaries) {
    const bucket = softIds.has(summary.id) ? advisory : hardGated
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

export function evalRepeats(): number {
  const parsed = Number(process.env.EVAL_REPEATS)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_EVAL_REPEATS
  return Math.floor(parsed)
}

export function hardFailureConfirmations(): number {
  const configured = process.env.EVAL_CONFIRM_HARD_FAILURES
  if (configured === undefined && process.env.EVAL_RETRY_HARD === "1") return 2
  const parsed = Number(configured)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}
