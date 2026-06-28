import { anthropic, buildCachedSystemPrompt, HAIKU_MODEL } from "@shopkeeper/agent/ai"
import { readModelUsage } from "@shopkeeper/agent/usage"
import type { EvalUsage, FixtureRunSummary, PhaseUsage } from "./types"

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
) {
  if (!response || typeof response !== "object" || !("usage" in response)) return
  const modelUsage = readModelUsage(response as { usage?: unknown })
  usage.modelCalls += 1
  usage.inputTokens += modelUsage.inputTokens
  usage.outputTokens += modelUsage.outputTokens
  usage.cacheReadInputTokens += modelUsage.cacheReadInputTokens
  usage.cacheCreationInputTokens += modelUsage.cacheCreationInputTokens
  if (phase) addPhaseUsage(phase, modelUsage)
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

export function formatUsageBreakdown(summaries: readonly FixtureRunSummary[]): string {
  const planner = zeroPhaseUsage()
  const run = zeroPhaseUsage()
  const judge = zeroPhaseUsage()
  for (const summary of summaries) {
    for (const result of summary.results) {
      addPhaseUsage(planner, result.usage.plannerUsage)
      addPhaseUsage(run, result.usage.runUsage)
      addPhaseUsage(judge, result.usage.judgeUsage)
    }
  }
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
