import { db } from './index.js';
import { usageToNanoDollars, utcDayString, type LlmUsageTokens } from './llm-spend.js';

// Postgres-backed daily LLM spend counter. Dashboard and gateway both call
// these so the per-org cap is enforced against one shared total instead of two
// separate Redis instances. Amounts are integer nano-dollars; BigInt keeps a
// day's running total well within int8 even at high caps.

export async function getDailyLlmSpendNano(orgId: string, day: string = utcDayString()): Promise<number> {
  const row = await db.llmDailySpend.findUnique({
    where: { organizationId_day: { organizationId: orgId, day } },
    select: { spentNanoUsd: true },
  });
  return row ? Number(row.spentNanoUsd) : 0;
}

export async function recordDailyLlmSpend(
  orgId: string,
  usage: LlmUsageTokens,
  model: string,
  day: string = utcDayString(),
): Promise<void> {
  const delta = usageToNanoDollars(usage, model);
  if (delta <= 0) return;
  const deltaBig = BigInt(delta);
  await db.llmDailySpend.upsert({
    where: { organizationId_day: { organizationId: orgId, day } },
    create: { organizationId: orgId, day, spentNanoUsd: deltaBig },
    update: { spentNanoUsd: { increment: deltaBig } },
  });
}
