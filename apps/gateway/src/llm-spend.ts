import {
  DEFAULT_DAILY_LLM_SPEND_CAP_USD,
  SpendCapError,
  getDailyLlmSpendNano,
  recordDailyLlmSpend,
  usdToNanoDollars,
  type LlmUsageTokens,
} from '@clerk/db';
import logger from './logger.js';

// Per-org daily LLM spend backstop. Reads/writes the Postgres counter in
// @clerk/db, shared with the dashboard so the cap is enforced per-org across
// both apps.

export interface GatewaySpendSettings {
  dailyLLMSpendCapUsd: number | null;
}

function capNanoUsd(settings: GatewaySpendSettings | null | undefined): number {
  const usd = settings?.dailyLLMSpendCapUsd ?? DEFAULT_DAILY_LLM_SPEND_CAP_USD;
  return usdToNanoDollars(usd);
}

export async function getDailySpendNano(orgId: string): Promise<number> {
  try {
    return await getDailyLlmSpendNano(orgId);
  } catch (err) {
    logger.warn({ err, orgId }, '[spend] read failed, treating as zero');
    return 0;
  }
}

export async function enforceSpendCap(
  orgId: string,
  settings: GatewaySpendSettings | null | undefined,
): Promise<void> {
  const cap = capNanoUsd(settings);
  const current = await getDailySpendNano(orgId);
  if (current >= cap) {
    throw new SpendCapError(current, cap);
  }
}

export async function recordSpend(
  orgId: string,
  usage: LlmUsageTokens,
  model: string,
): Promise<void> {
  try {
    await recordDailyLlmSpend(orgId, usage, model);
  } catch (err) {
    logger.warn({ err, orgId, model }, '[spend] record failed');
  }
}

export function readUsageFromAnthropic(response: { usage?: unknown }): LlmUsageTokens {
  const usage = (response.usage ?? {}) as {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
  };
}
