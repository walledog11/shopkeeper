import { afterEach, describe, expect, it } from 'vitest';
import { LlmBudgetUnavailableError, SpendCapError, usageToNanoDollars, usdToNanoDollars, utcDayString, db } from '@shopkeeper/db';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import { enforceSpendCap, getDailySpendNano, recordSpend } from './spend.js';

const MODEL = 'claude-haiku-4-5-20251001';
const USAGE = {
  inputTokens: 3,
  outputTokens: 5,
  cacheCreationInputTokens: 7,
  cacheReadInputTokens: 11,
};

let orgId: string | null = null;

async function seedSpend(organizationId: string, nano: number) {
  await db.llmDailySpend.create({
    data: { organizationId, day: utcDayString(), model: MODEL, spentNanoUsd: BigInt(nano) },
  });
}

describe('llm spend', () => {
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

    await expect(enforceSpendCap(org.id, { dailyLLMSpendCapUsd: 1 })).rejects.toBeInstanceOf(SpendCapError);
  });

  it('accumulates spend across calls', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    const expectedDelta = usageToNanoDollars(USAGE, MODEL);

    await recordSpend(org.id, USAGE, MODEL);
    await recordSpend(org.id, USAGE, MODEL);

    await expect(getDailySpendNano(org.id)).resolves.toBe(expectedDelta * 2);
  });

  it('fails closed on DB reads while containing usage-write failures', async () => {
    // Inbound persistence happens before these checks. If accounting cannot be
    // read, paid model work pauses instead of silently spending against zero.
    await expect(getDailySpendNano('not-a-uuid')).rejects.toBeInstanceOf(LlmBudgetUnavailableError);
    await expect(enforceSpendCap('not-a-uuid', { dailyLLMSpendCapUsd: 1 })).rejects.toBeInstanceOf(LlmBudgetUnavailableError);
    await expect(recordSpend('not-a-uuid', USAGE, MODEL)).resolves.toBeUndefined();
  });
});

describe('usageToNanoDollars cache-write TTL pricing', () => {
  const SONNET = 'claude-sonnet-5';

  it('fails closed when the model has no committed price', () => {
    expect(() => usageToNanoDollars(
      { inputTokens: 1, outputTokens: 1 },
      'claude-unpriced-future-model',
    )).toThrow('No committed API price');
  });

  it('prices 1h writes at 2x input and 5m writes at 1.25x', () => {
    // Sonnet 5 input is $2.00/MTok => 2000 nano/token; 1h = 4000, 5m = 2500.
    expect(
      usageToNanoDollars(
        {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 1000,
          cacheCreation1hInputTokens: 600,
        },
        SONNET,
      ),
    ).toBe(600 * 4000 + 400 * 2500);
  });

  it('charges the whole total at the 1h rate when no breakdown is present', () => {
    // The backstop must never undercount, so an absent breakdown is billed dear.
    expect(
      usageToNanoDollars(
        { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 1000 },
        SONNET,
      ),
    ).toBe(1000 * 4000);
  });

  it('never lets a bad breakdown exceed the reported total', () => {
    expect(
      usageToNanoDollars(
        {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationInputTokens: 100,
          cacheCreation1hInputTokens: 999,
        },
        SONNET,
      ),
    ).toBe(100 * 4000);
  });

  it('prices a real split-prompt cold write correctly', () => {
    // Measured against production's prompt shape: the stable prefix writes at
    // 1h and the per-thread volatile block at 5m.
    const cold = usageToNanoDollars(
      {
        inputTokens: 83,
        outputTokens: 8,
        cacheCreationInputTokens: 11890,
        cacheCreation1hInputTokens: 11848,
        cacheReadInputTokens: 0,
      },
      SONNET,
    );
    const wrongFlat1_25 = 83 * 2000 + 8 * 10000 + 11890 * 2500;

    expect(cold).toBe(83 * 2000 + 8 * 10000 + 11848 * 4000 + 42 * 2500);
    // The old flat 1.25x rate undercounted this call by 0.75x input on every
    // 1h token — about 1.8 cents.
    expect(cold - wrongFlat1_25).toBe(11848 * 1500);
  });

  it('adds nothing on a warm call, which writes no 1h tokens', () => {
    const warm = {
      inputTokens: 83,
      outputTokens: 8,
      cacheCreationInputTokens: 43,
      cacheCreation1hInputTokens: 0,
      cacheReadInputTokens: 11848,
    };
    const flat1_25 = 83 * 2000 + 8 * 10000 + 43 * 2500 + 11848 * 200;

    expect(usageToNanoDollars(warm, SONNET)).toBe(flat1_25);
  });
});
