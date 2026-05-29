import {
  DEFAULT_DAILY_LLM_SPEND_CAP_USD,
  SPEND_KEY_TTL_SECONDS,
  SpendCapError,
  spendKey,
  usageToNanoDollars,
  usdToNanoDollars,
  type LlmUsageTokens,
} from "@clerk/db";
import type { OrgSettings } from "@/types";
import logger from "@/lib/server/logger";
import { getRedis } from "@/lib/server/redis";

// Backstop on per-org daily LLM spend. Tracked in Redis as integer nano-dollars.
// Concurrent calls can briefly overshoot the cap by at most ~one call's worth
// per parallel run , acceptable for a backstop whose job is to stop runaway
// loops, not enforce a billing meter to the cent.

function capNanoUsd(settings: OrgSettings): number {
  const usd = settings.dailyLLMSpendCapUsd ?? DEFAULT_DAILY_LLM_SPEND_CAP_USD;
  return usdToNanoDollars(usd);
}

export async function getDailySpendNano(orgId: string): Promise<number> {
  try {
    const raw = await getRedis().get<string | number | null>(spendKey(orgId));
    if (raw === null || raw === undefined) return 0;
    const parsed = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch (err) {
    logger.warn({ err, orgId }, "[spend] read failed, treating as zero");
    return 0;
  }
}

export async function enforceSpendCap(orgId: string, settings: OrgSettings): Promise<void> {
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
    const redis = getRedis();
    const key = spendKey(orgId);
    const next = await redis.incrby(key, delta);
    if (next === delta) {
      // First increment of the day , set TTL so the key doesn't outlive the window.
      await redis.expire(key, SPEND_KEY_TTL_SECONDS);
    }
  } catch (err) {
    logger.warn({ err, orgId, delta, model }, "[spend] record failed");
  }
}
