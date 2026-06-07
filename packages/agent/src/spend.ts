import {
  DEFAULT_DAILY_LLM_SPEND_CAP_USD,
  SpendCapError,
  getDailyLlmSpendNano,
  recordDailyLlmSpend,
  usdToNanoDollars,
  type LlmUsageTokens,
} from "@shopkeeper/db";
import logger from "./logger.js";

// Backstop on per-org daily LLM spend. Persisted in Postgres (one row per org
// per UTC day) as integer nano-dollars, shared with the gateway so the cap is
// enforced per-org across both apps. Concurrent calls can briefly overshoot the
// cap by at most ~one call's worth per parallel run , acceptable for a backstop
// whose job is to stop runaway loops, not enforce a billing meter to the cent.

// Only field the cap needs. A full OrgSettings satisfies this; the gateway can
// pass a bare `{ dailyLLMSpendCapUsd }` or null (→ default cap).
export type SpendCapSettings = { dailyLLMSpendCapUsd?: number | null };

function capNanoUsd(settings: SpendCapSettings | null | undefined): number {
  const usd = settings?.dailyLLMSpendCapUsd ?? DEFAULT_DAILY_LLM_SPEND_CAP_USD;
  return usdToNanoDollars(usd);
}

export async function getDailySpendNano(orgId: string): Promise<number> {
  try {
    return await getDailyLlmSpendNano(orgId);
  } catch (err) {
    logger.warn({ err, orgId }, "[spend] read failed, treating as zero");
    return 0;
  }
}

export async function enforceSpendCap(
  orgId: string,
  settings: SpendCapSettings | null | undefined,
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
    logger.warn({ err, orgId, model }, "[spend] record failed");
  }
}
