import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupTestData,
  createTestOrg,
} from '@shopkeeper/db/test-helpers';
import {
  getDailyRefundSpendCents,
  incrementDailyRefundSpendCents,
} from '@shopkeeper/db';

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;

describe('refund-spend', () => {
  beforeEach(async () => {
    org = await createTestOrg();
  });

  afterEach(async () => {
    await cleanupTestData(org?.id);
    org = null;
  });

  it('returns 0 when no spend is recorded for the day', async () => {
    const spent = await getDailyRefundSpendCents(org!.id, '2026-06-05');

    expect(spent).toBe(0);
  });

  it('returns the current total after increments', async () => {
    await incrementDailyRefundSpendCents(org!.id, 1500, '2026-06-05');
    await incrementDailyRefundSpendCents(org!.id, 750, '2026-06-05');

    const spent = await getDailyRefundSpendCents(org!.id, '2026-06-05');
    expect(spent).toBe(2250);
  });

  it('keeps separate daily totals', async () => {
    await incrementDailyRefundSpendCents(org!.id, 100, '2026-06-05');
    await incrementDailyRefundSpendCents(org!.id, 200, '2026-06-06');

    expect(await getDailyRefundSpendCents(org!.id, '2026-06-05')).toBe(100);
    expect(await getDailyRefundSpendCents(org!.id, '2026-06-06')).toBe(200);
  });

  it('ignores non-positive or non-finite deltas', async () => {
    await incrementDailyRefundSpendCents(org!.id, 0, '2026-06-05');
    await incrementDailyRefundSpendCents(org!.id, -50, '2026-06-05');
    await incrementDailyRefundSpendCents(org!.id, NaN, '2026-06-05');

    expect(await getDailyRefundSpendCents(org!.id, '2026-06-05')).toBe(0);
  });

  it('isolates spend by org', async () => {
    const otherOrg = await createTestOrg();
    try {
      await incrementDailyRefundSpendCents(org!.id, 100, '2026-06-05');
      await incrementDailyRefundSpendCents(otherOrg.id, 500, '2026-06-05');

      expect(await getDailyRefundSpendCents(org!.id, '2026-06-05')).toBe(100);
      expect(await getDailyRefundSpendCents(otherOrg.id, '2026-06-05')).toBe(500);
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });
});
