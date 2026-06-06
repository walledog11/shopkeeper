import { db } from './index.js';
import { utcDayString } from './llm-spend.js';

// Postgres-backed daily refund-cap counter. Dashboard and gateway both call
// these so the per-org refund cap is enforced against one shared total instead
// of two separate Redis instances. Amounts are integer cents.

export async function getDailyRefundSpendCents(
  orgId: string,
  day: string = utcDayString(),
): Promise<number> {
  const row = await db.refundDailySpend.findUnique({
    where: { organizationId_day: { organizationId: orgId, day } },
    select: { spentCents: true },
  });
  return row?.spentCents ?? 0;
}

export async function incrementDailyRefundSpendCents(
  orgId: string,
  cents: number,
  day: string = utcDayString(),
): Promise<void> {
  const delta = Math.round(cents);
  if (!Number.isFinite(delta) || delta <= 0) return;
  await db.refundDailySpend.upsert({
    where: { organizationId_day: { organizationId: orgId, day } },
    create: { organizationId: orgId, day, spentCents: delta },
    update: { spentCents: { increment: delta } },
  });
}
