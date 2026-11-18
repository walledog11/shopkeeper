import {
  DEFAULT_DAILY_LLM_SPEND_CAP_USD,
  LlmBudgetUnavailableError,
  SpendCapError,
  getDailyLlmSpendNano,
  getPlatformDailyLlmSpendNano,
  platformDailyLlmSpendStopUsd,
  recordDailyLlmSpend,
  usdToNanoDollars,
  utcDayString,
  type LlmUsageTokens,
} from "@shopkeeper/db";
import logger from "./logger.js";
import { MAX_DAILY_LLM_SPEND_CAP_USD } from "./settings-parser.js";

// Backstop on per-org daily LLM spend. Persisted in Postgres (one row per org
// per UTC day) as integer nano-dollars, shared with the gateway so the cap is
// enforced per-org across both apps. Concurrent calls can briefly overshoot the
// cap by at most ~one call's worth per parallel run — acceptable for a backstop
// whose job is to stop runaway loops, not enforce a billing meter to the cent.

// Only field the cap needs. A full OrgSettings satisfies this; the gateway can
// pass a bare `{ dailyLLMSpendCapUsd }` or null (→ default cap).
export type SpendCapSettings = { dailyLLMSpendCapUsd?: number | null };

// Some callers pass the stored value unparsed, so the maximum is applied here too.
function capNanoUsd(settings: SpendCapSettings | null | undefined): number {
  const usd = settings?.dailyLLMSpendCapUsd ?? DEFAULT_DAILY_LLM_SPEND_CAP_USD;
  return usdToNanoDollars(Math.min(usd, MAX_DAILY_LLM_SPEND_CAP_USD));
}

// The platform total sums every workspace's rows for the day, so each process
// reads it at most once a minute; the stop can trail the true total by about a
// minute of spend.
const PLATFORM_SPEND_READ_TTL_MS = 60_000;
let platformSpendRead: { day: string; nanoUsd: number; readAtMs: number } | null = null;

async function getPlatformDailySpendNano(): Promise<number> {
  const day = utcDayString();
  const nowMs = Date.now();
  if (platformSpendRead?.day === day && nowMs - platformSpendRead.readAtMs < PLATFORM_SPEND_READ_TTL_MS) {
    return platformSpendRead.nanoUsd;
  }
  try {
    const nanoUsd = await getPlatformDailyLlmSpendNano(day);
    platformSpendRead = { day, nanoUsd, readAtMs: nowMs };
    return nanoUsd;
  } catch (err) {
    logger.error({ err }, "[spend] platform read failed, pausing paid model work");
    throw new LlmBudgetUnavailableError();
  }
}

export async function getDailySpendNano(orgId: string): Promise<number> {
  try {
    return await getDailyLlmSpendNano(orgId);
  } catch (err) {
    logger.error({ err, orgId }, "[spend] read failed, pausing paid model work");
    throw new LlmBudgetUnavailableError();
  }
}

export async function enforceSpendCap(
  orgId: string,
  settings: SpendCapSettings | null | undefined,
): Promise<void> {
  const cap = capNanoUsd(settings);
  const current = await getDailySpendNano(orgId);
  if (current >= cap) {
    throw new SpendCapError(current, cap, "workspace");
  }
  const stop = usdToNanoDollars(platformDailyLlmSpendStopUsd());
  const platformTotal = await getPlatformDailySpendNano();
  if (platformTotal >= stop) {
    throw new SpendCapError(platformTotal, stop, "platform");
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
