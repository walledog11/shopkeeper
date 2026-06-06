import { afterEach, describe, expect, it } from 'vitest';
import { getDailyRefundSpendCents, incrementDailyRefundSpendCents, utcDayString } from '@clerk/db';
import { createTestOrg, cleanupTestData } from '@clerk/db/test-helpers';

let orgId: string | null = null;

describe('refund spend', () => {
  afterEach(async () => {
    await cleanupTestData(orgId);
    orgId = null;
  });

  it('returns 0 when no spend is recorded today', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await expect(getDailyRefundSpendCents(org.id)).resolves.toBe(0);
  });

  it('returns the current total after increments', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await incrementDailyRefundSpendCents(org.id, 1500);
    await incrementDailyRefundSpendCents(org.id, 750);

    await expect(getDailyRefundSpendCents(org.id)).resolves.toBe(2250);
  });

  it('ignores non-positive or non-finite deltas', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await incrementDailyRefundSpendCents(org.id, 0);
    await incrementDailyRefundSpendCents(org.id, -50);
    await incrementDailyRefundSpendCents(org.id, NaN);

    await expect(getDailyRefundSpendCents(org.id)).resolves.toBe(0);
  });

  it('scopes spend by day', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await incrementDailyRefundSpendCents(org.id, 400, '2020-01-01');

    await expect(getDailyRefundSpendCents(org.id, '2020-01-01')).resolves.toBe(400);
    await expect(getDailyRefundSpendCents(org.id, utcDayString())).resolves.toBe(0);
  });

  it('isolates spend by org', async () => {
    const orgA = await createTestOrg();
    const orgB = await createTestOrg();
    orgId = orgA.id;

    try {
      await incrementDailyRefundSpendCents(orgA.id, 100);
      await incrementDailyRefundSpendCents(orgB.id, 500);

      await expect(getDailyRefundSpendCents(orgA.id)).resolves.toBe(100);
      await expect(getDailyRefundSpendCents(orgB.id)).resolves.toBe(500);
    } finally {
      await cleanupTestData(orgB.id);
    }
  });
});
