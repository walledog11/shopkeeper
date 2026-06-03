import { afterEach, describe, expect, it } from 'vitest';
import { SpendCapError, usageToNanoDollars, usdToNanoDollars, utcDayString, db } from '@clerk/db';
import { createTestOrg, cleanupTestData } from '@clerk/db/test-helpers';
import { AGENT_SETTINGS_DEFAULTS } from './settings';
import { enforceSpendCap, getDailySpendNano, recordSpend } from './spend';

const MODEL = 'claude-haiku-4-5-20251001';
const USAGE = {
  inputTokens: 3,
  outputTokens: 5,
  cacheCreationInputTokens: 7,
  cacheReadInputTokens: 11,
};

function makeSettings(dailyLLMSpendCapUsd: number | null) {
  return {
    ...AGENT_SETTINGS_DEFAULTS,
    dailyLLMSpendCapUsd,
  };
}

let orgId: string | null = null;

async function seedSpend(organizationId: string, nano: number) {
  await db.llmDailySpend.create({
    data: { organizationId, day: utcDayString(), spentNanoUsd: BigInt(nano) },
  });
}

describe('agent spend', () => {
  afterEach(async () => {
    await cleanupTestData(orgId);
    orgId = null;
  });

  it('reads zero when no spend is recorded', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await expect(getDailySpendNano(org.id)).resolves.toBe(0);
  });

  it.each([
    ['meets', usdToNanoDollars(1)],
    ['exceeds', usdToNanoDollars(1) + 1],
  ])('enforces the cap when current spend %s the cap', async (_case, currentSpend) => {
    const org = await createTestOrg();
    orgId = org.id;
    await seedSpend(org.id, currentSpend);

    await expect(enforceSpendCap(org.id, makeSettings(1))).rejects.toBeInstanceOf(SpendCapError);
  });

  it('accumulates spend across calls', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const expectedDelta = usageToNanoDollars(USAGE, MODEL);

    await recordSpend(org.id, USAGE, MODEL);
    await recordSpend(org.id, USAGE, MODEL);

    await expect(getDailySpendNano(org.id)).resolves.toBe(expectedDelta * 2);
  });

  it('falls back safely when the DB read or write fails', async () => {
    // An invalid org id makes Prisma throw; the cap is a backstop, so it must
    // fail open (read as zero, swallow the write) rather than block the agent.
    await expect(getDailySpendNano('not-a-uuid')).resolves.toBe(0);
    await expect(enforceSpendCap('not-a-uuid', makeSettings(1))).resolves.toBeUndefined();
    await expect(recordSpend('not-a-uuid', USAGE, MODEL)).resolves.toBeUndefined();
  });
});
