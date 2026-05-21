import {
  DEFAULT_DAILY_LLM_SPEND_CAP_USD,
  SPEND_KEY_TTL_SECONDS,
  SpendCapError,
  spendKey,
  usageToNanoDollars,
  usdToNanoDollars,
  type LlmUsageTokens,
} from '@clerk/db';
import type { Redis as IORedis } from 'ioredis';
import { createGatewayRedisClient } from './clients/redis-client.js';
import logger from './logger.js';

// Mirror of apps/dashboard/src/lib/agent/spend.ts using ioredis. Shares the
// same Redis key namespace so dashboard and gateway counters interop.

let client: IORedis | null = null;
function getClient(): IORedis {
  if (!client) {
    client = createGatewayRedisClient();
    client.on('error', (err) => logger.warn({ err }, '[spend] redis error'));
  }
  return client;
}

export interface GatewaySpendSettings {
  dailyLLMSpendCapUsd: number | null;
}

function capNanoUsd(settings: GatewaySpendSettings | null | undefined): number {
  const usd = settings?.dailyLLMSpendCapUsd ?? DEFAULT_DAILY_LLM_SPEND_CAP_USD;
  return usdToNanoDollars(usd);
}

export async function getDailySpendNano(orgId: string): Promise<number> {
  try {
    const raw = await getClient().get(spendKey(orgId));
    if (raw === null || raw === undefined) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
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
  const delta = usageToNanoDollars(usage, model);
  if (delta <= 0) return;
  try {
    const redis = getClient();
    const key = spendKey(orgId);
    const next = await redis.incrby(key, delta);
    if (next === delta) {
      await redis.expire(key, SPEND_KEY_TTL_SECONDS);
    }
  } catch (err) {
    logger.warn({ err, orgId, delta, model }, '[spend] record failed');
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
