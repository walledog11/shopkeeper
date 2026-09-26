import { anthropic, buildCachedSystemPrompt, HAIKU_MODEL } from "@shopkeeper/agent/ai"
import { DISCOVERY_TOOL_NAME } from "@shopkeeper/agent/planner"
import { readModelUsage } from "@shopkeeper/agent/usage"
import type { BaselineUsage, EvalUsage, FixtureRunSummary, PhaseUsage } from "./types"

export interface CacheProbeUsage {
  firstCreate: number
  firstRead: number
  secondCreate: number
  secondRead: number
}

export async function probeSystemPromptCacheRead(): Promise<CacheProbeUsage> {
  const systemText = `You are a careful support agent.\n${"Follow the workspace policies and answer accurately. ".repeat(1200)}`
  const system = buildCachedSystemPrompt(systemText)
  const callOnce = async () => {
    const response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 16,
      system,
      messages: [{ role: "user", content: "Reply with the single word OK." }],
    })
    return readModelUsage(response)
  }
  const first = await callOnce()
  const second = await callOnce()
  return {
    firstCreate: first.cacheCreationInputTokens,
    firstRead: first.cacheReadInputTokens,
    secondCreate: second.cacheCreationInputTokens,
    secondRead: second.cacheReadInputTokens,
  }
}

export function recordEvalUsage(
  usage: EvalUsage,
  response: unknown,
  phase: PhaseUsage | null,
  model?: string,
) {
  if (!response || typeof response !== "object" || !("usage" in response)) return
  const modelUsage = readModelUsage(response as { usage?: unknown })
  usage.modelCalls += 1
  usage.inputTokens += modelUsage.inputTokens
  usage.outputTokens += modelUsage.outputTokens
  usage.cacheReadInputTokens += modelUsage.cacheReadInputTokens
  usage.cacheCreationInputTokens += modelUsage.cacheCreationInputTokens
  if (phase) addPhaseUsage(phase, modelUsage)
  if (model) {
    const modelTotal = usage.models[model] ?? zeroPhaseUsage()
    addPhaseUsage(modelTotal, modelUsage)
    usage.models[model] = modelTotal
  }
}

export function countDiscoveryCalls(response: unknown): number {
  if (!response || typeof response !== "object" || !("content" in response)) return 0
  const content = (response as { content?: unknown }).content
  if (!Array.isArray(content)) return 0
  return content.filter(block => (
    block && typeof block === "object" && block.type === "tool_use" && block.name === DISCOVERY_TOOL_NAME
  )).length
}

function nearestRank(sorted: readonly number[], percentile: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)]
}

/**
 * Per-run latency, cost, model calls and discovery calls across every executed
 * fixture run, the measures the latency and cost budgets are set against.
 * Percentiles are nearest-rank over runs, not over fixtures.
 */
export function formatTaskSummary(summaries: readonly FixtureRunSummary[]): string {
  const results = summaries.flatMap(summary => summary.results)
  const latencies = results.map(result => result.latencyMs).sort((a, b) => a - b)
  const costs = results.map(result => result.usage.taskCostUsd).sort((a, b) => a - b)
  const total = (read: (usage: EvalUsage) => number) => results.reduce((sum, result) => sum + read(result.usage), 0)
  return `[eval:task] runs=${results.length}`
    + ` latency p50=${nearestRank(latencies, 50)}ms p95=${nearestRank(latencies, 95)}ms`
    + ` cost p50=$${nearestRank(costs, 50).toFixed(4)} p95=$${nearestRank(costs, 95).toFixed(4)} total=$${total(usage => usage.taskCostUsd).toFixed(4)}`
    + ` modelCalls=${total(usage => usage.modelCalls)} discoveryCalls=${total(usage => usage.discoveryCalls)}`
}

export function zeroPhaseUsage(): PhaseUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  }
}

function addPhaseUsage(into: PhaseUsage, from: PhaseUsage): void {
  into.inputTokens += from.inputTokens
  into.outputTokens += from.outputTokens
  into.cacheReadInputTokens += from.cacheReadInputTokens
  into.cacheCreationInputTokens += from.cacheCreationInputTokens
}

function phaseUsageLine(label: string, phase: PhaseUsage): string {
  const prompt = phase.inputTokens
    + phase.cacheCreationInputTokens
    + phase.cacheReadInputTokens
  const hitRatio = prompt > 0 ? phase.cacheReadInputTokens / prompt : 0
  const weighted = phase.inputTokens
    + phase.cacheCreationInputTokens * 1.25
    + phase.cacheReadInputTokens * 0.1
  const costMultiplier = prompt > 0 ? weighted / prompt : 1
  return `  ${label.padEnd(8)} prompt=${prompt} (input=${phase.inputTokens} cacheWrite=${phase.cacheCreationInputTokens} cacheRead=${phase.cacheReadInputTokens}) out=${phase.outputTokens} cacheHit=${(hitRatio * 100).toFixed(1)}% costVsUncached=${costMultiplier.toFixed(2)}x`
}

/**
 * Phase token totals across every fixture run, with the run count that makes
 * them comparable to another capture. Persisted into the baseline so a tuning
 * change has a cost number to be judged against, not just a pass rate.
 */
export function summarizeUsage(summaries: readonly FixtureRunSummary[]): BaselineUsage {
  const usage: BaselineUsage = {
    runs: 0,
    planner: zeroPhaseUsage(),
    run: zeroPhaseUsage(),
    judge: zeroPhaseUsage(),
    models: {},
  }
  for (const summary of summaries) {
    for (const result of summary.results) {
      usage.runs += 1
      addPhaseUsage(usage.planner, result.usage.plannerUsage)
      addPhaseUsage(usage.run, result.usage.runUsage)
      addPhaseUsage(usage.judge, result.usage.judgeUsage)
      for (const [model, modelUsage] of Object.entries(result.usage.models)) {
        const modelTotal = usage.models![model] ?? zeroPhaseUsage()
        addPhaseUsage(modelTotal, modelUsage)
        usage.models![model] = modelTotal
      }
    }
  }
  return usage
}

export function formatModelUsageBreakdown(summaries: readonly FixtureRunSummary[]): string {
  const models = summarizeUsage(summaries).models ?? {}
  return [
    "[eval:model-usage] token breakdown by model (tokens, not $):",
    ...Object.entries(models).sort(([a], [b]) => a.localeCompare(b)).map(
      ([model, usage]) => phaseUsageLine(model, usage),
    ),
  ].join("\n")
}

export function formatUsageBreakdown(summaries: readonly FixtureRunSummary[]): string {
  const { planner, run, judge } = summarizeUsage(summaries)
  const total = zeroPhaseUsage()
  addPhaseUsage(total, planner)
  addPhaseUsage(total, run)
  addPhaseUsage(total, judge)
  return [
    "[eval:usage] prompt-token + cache breakdown by phase (tokens, not $):",
    phaseUsageLine("planner", planner),
    phaseUsageLine("run", run),
    phaseUsageLine("judge", judge),
    phaseUsageLine("TOTAL", total),
  ].join("\n")
}

function promptTokens(phase: PhaseUsage): number {
  return phase.inputTokens + phase.cacheCreationInputTokens + phase.cacheReadInputTokens
}

function deltaLine(
  label: string,
  current: { phase: PhaseUsage; runs: number },
  baseline: { phase: PhaseUsage; runs: number },
): string {
  const perRun = (value: number, runs: number) => (runs > 0 ? value / runs : 0)
  const part = (name: string, read: (phase: PhaseUsage) => number) => {
    const now = perRun(read(current.phase), current.runs)
    const before = perRun(read(baseline.phase), baseline.runs)
    const pct = before > 0 ? ((now - before) / before) * 100 : 0
    const sign = pct >= 0 ? "+" : ""
    return `${name}/run ${now.toFixed(0)} vs ${before.toFixed(0)} (${sign}${pct.toFixed(1)}%)`
  }
  return `  ${label.padEnd(8)} ${part("out", phase => phase.outputTokens)}  ${part("prompt", promptTokens)}`
}

/**
 * Per-run token movement against the committed baseline.
 *
 * Output tokens are the line to read for a thinking change — thinking bills as
 * output — and prompt tokens for anything touching context or tool schemas.
 */
export function formatUsageDelta(current: BaselineUsage, baseline: BaselineUsage): string {
  return [
    `[eval:usage-delta] per-run tokens vs baseline (${current.runs} runs vs ${baseline.runs}):`,
    deltaLine("planner", { phase: current.planner, runs: current.runs }, { phase: baseline.planner, runs: baseline.runs }),
    deltaLine("run", { phase: current.run, runs: current.runs }, { phase: baseline.run, runs: baseline.runs }),
  ].join("\n")
}
