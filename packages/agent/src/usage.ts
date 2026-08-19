export interface ModelUsageMetrics {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  // The 1-hour-TTL share of cacheCreationInputTokens. Carried here as well as
  // per call because this shape satisfies `LlmUsageTokens`: without it, handing
  // accumulated metrics to `usageToNanoDollars` would hit the no-breakdown path
  // and bill every cache write at the 1-hour rate.
  cacheCreation1hInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
  // Cost-weighted token count for the loop's iteration budget. Cache reads are
  // ~10x cheaper and 5m cache writes ~1.25x an input token, so summing them at
  // full weight (as totalTokens does) makes a cached operator turn look far
  // heavier than it costs. totalTokens stays raw for logging/spend continuity.
  //
  // The 1h block is excluded outright — the divergence from `usageToNanoDollars`,
  // which bills it at 2x and is right to. It is the stable system prefix from
  // `buildSplitCachedSystemPrompt`: written once on a cold cache, then read by
  // every later call in this run and in other threads'. That is a startup cost,
  // identical whether the turn makes one tool call or ten, so it is not loop
  // progress and must not consume what TOKEN_BUDGET reserves for iterations.
  // Charging it spent 75% of the budget (14,954 of 20,000) on a cold support
  // turn before its first tool call, while an identical warm turn spent 7% — the
  // guard's headroom tracked cache temperature rather than loop behavior.
  budgetTokens: number;
}

type AnthropicUsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  // Per-TTL breakdown of cache_creation_input_tokens.
  cache_creation?: {
    ephemeral_1h_input_tokens?: number | null;
    ephemeral_5m_input_tokens?: number | null;
  } | null;
};

export function createModelUsageMetrics(): ModelUsageMetrics {
  return {
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheCreation1hInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0,
    budgetTokens: 0,
  };
}

export function readModelUsage(response: { usage?: unknown }) {
  const usage = (response.usage ?? {}) as AnthropicUsageLike;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheCreationInputTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadInputTokens = usage.cache_read_input_tokens ?? 0;
  // Absent a breakdown, treat every cache write as 1-hour — the dearer rate, and
  // the same no-undercount default `usageToNanoDollars` applies.
  const cacheCreation1hInputTokens = Math.min(
    usage.cache_creation?.ephemeral_1h_input_tokens ?? cacheCreationInputTokens,
    cacheCreationInputTokens,
  );
  // The loop budget needs the OPPOSITE no-breakdown default to pricing above: an
  // unattributed write must COUNT against it, or a missing breakdown silently
  // blinds the runaway-loop guard. Hence `?? 0`, and not `cacheCreation1hInputTokens`.
  const stableCacheCreation = Math.min(
    usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
    cacheCreationInputTokens,
  );
  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheCreation1hInputTokens,
    cacheReadInputTokens,
    totalTokens: inputTokens + outputTokens + cacheCreationInputTokens + cacheReadInputTokens,
    budgetTokens: Math.round(
      inputTokens +
        outputTokens +
        1.25 * (cacheCreationInputTokens - stableCacheCreation) +
        0.1 * cacheReadInputTokens,
    ),
  };
}

export function recordModelUsage(metrics: ModelUsageMetrics, response: { usage?: unknown }) {
  const usage = readModelUsage(response);
  metrics.modelCalls += 1;
  metrics.inputTokens += usage.inputTokens;
  metrics.outputTokens += usage.outputTokens;
  metrics.cacheCreationInputTokens += usage.cacheCreationInputTokens;
  metrics.cacheCreation1hInputTokens += usage.cacheCreation1hInputTokens;
  metrics.cacheReadInputTokens += usage.cacheReadInputTokens;
  metrics.totalTokens += usage.totalTokens;
  metrics.budgetTokens += usage.budgetTokens;
  return usage;
}

export function hashInstructionForLog(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
