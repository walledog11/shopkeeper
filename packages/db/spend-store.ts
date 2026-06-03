import { db } from './index.js';
import { usageToNanoDollars, utcDayString, type LlmUsageTokens } from './llm-spend.js';

// Postgres-backed daily LLM spend counter. Dashboard and gateway both call
// these so the per-org cap is enforced against one shared total instead of two
// separate Redis instances. Amounts are integer nano-dollars; BigInt keeps a
// day's running total well within int8 even at high caps.

export async function getDailyLlmSpendNano(orgId: string, day: string = utcDayString()): Promise<number> {
  const result = await db.llmDailySpend.aggregate({
    where: { organizationId: orgId, day },
    _sum: { spentNanoUsd: true },
  });
  return result._sum.spentNanoUsd ? Number(result._sum.spentNanoUsd) : 0;
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
    where: { organizationId_day_model: { organizationId: orgId, day, model } },
    create: { organizationId: orgId, day, model, spentNanoUsd: deltaBig, calls: 1 },
    update: { spentNanoUsd: { increment: deltaBig }, calls: { increment: 1 } },
  });
}
