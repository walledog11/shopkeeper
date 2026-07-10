export interface ModelUsageMetrics {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
  // Cost-weighted token count for the loop's iteration budget. Cache reads are
  // ~10x cheaper and cache writes ~1.25x an input token, so summing them at full
  // weight (as totalTokens does) makes a cached operator turn look far heavier
  // than it costs. totalTokens stays raw for logging/spend continuity.
  budgetTokens: number;
}

type AnthropicUsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function createModelUsageMetrics(): ModelUsageMetrics {
  return {
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
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

  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    totalTokens: inputTokens + outputTokens + cacheCreationInputTokens + cacheReadInputTokens,
    budgetTokens: Math.round(
      inputTokens + outputTokens + 1.25 * cacheCreationInputTokens + 0.1 * cacheReadInputTokens,
    ),
  };
}

export function recordModelUsage(metrics: ModelUsageMetrics, response: { usage?: unknown }) {
  const usage = readModelUsage(response);
  metrics.modelCalls += 1;
  metrics.inputTokens += usage.inputTokens;
  metrics.outputTokens += usage.outputTokens;
  metrics.cacheCreationInputTokens += usage.cacheCreationInputTokens;
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
