import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SPEND_KEY_TTL_SECONDS,
  SpendCapError,
  spendKey,
  usageToNanoDollars,
  usdToNanoDollars,
} from '@clerk/db';
import { enforceSpendCap, getDailySpendNano, recordSpend } from './llm-spend.js';

const { fakeRedis, mockCreateGatewayRedisClient } = vi.hoisted(() => {
  const store = new Map<string, number | string>();
  const fakeRedis = {
    store,
    on: vi.fn().mockReturnThis(),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    incrby: vi.fn(async (key: string, delta: number) => {
      const current = Number(store.get(key) ?? 0);
      const next = current + delta;
      store.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
  };

  return {
    fakeRedis,
    mockCreateGatewayRedisClient: vi.fn(() => fakeRedis),
  };
});

vi.mock('./clients/redis-client.js', () => ({
  createGatewayRedisClient: mockCreateGatewayRedisClient,
}));

vi.mock('./logger.js', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const MODEL = 'claude-haiku-4-5-20251001';
const USAGE = {
  inputTokens: 3,
  outputTokens: 5,
  cacheCreationInputTokens: 7,
  cacheReadInputTokens: 11,
};

describe('llm spend', () => {
  afterEach(() => {
    fakeRedis.store.clear();
    fakeRedis.on.mockClear();
    fakeRedis.get.mockClear();
    fakeRedis.incrby.mockClear();
    fakeRedis.expire.mockClear();
    mockCreateGatewayRedisClient.mockClear();
  });

  it('reads missing and non-numeric values as zero', async () => {
    await expect(getDailySpendNano('org_1')).resolves.toBe(0);

    fakeRedis.store.set(spendKey('org_1'), 'not-a-number');

    await expect(getDailySpendNano('org_1')).resolves.toBe(0);
  });

  it.each([
    ['meets', usdToNanoDollars(1)],
    ['exceeds', usdToNanoDollars(1) + 1],
  ])('enforces the cap when current spend %s the cap', async (_case, currentSpend) => {
    fakeRedis.store.set(spendKey('org_cap'), currentSpend);

    await expect(enforceSpendCap('org_cap', { dailyLLMSpendCapUsd: 1 })).rejects.toBeInstanceOf(SpendCapError);
  });

  it('increments spend and sets TTL only on the first increment', async () => {
    const expectedDelta = usageToNanoDollars(USAGE, MODEL);

    await recordSpend('org_increment', USAGE, MODEL);
    await recordSpend('org_increment', USAGE, MODEL);

    expect(fakeRedis.incrby).toHaveBeenCalledTimes(2);
    expect(fakeRedis.incrby).toHaveBeenCalledWith(spendKey('org_increment'), expectedDelta);
    expect(fakeRedis.store.get(spendKey('org_increment'))).toBe(expectedDelta * 2);
    expect(fakeRedis.expire).toHaveBeenCalledTimes(1);
    expect(fakeRedis.expire).toHaveBeenCalledWith(spendKey('org_increment'), SPEND_KEY_TTL_SECONDS);
  });

  it('falls back safely when Redis reads or writes fail', async () => {
    fakeRedis.get.mockRejectedValueOnce(new Error('redis read failed'));
    await expect(getDailySpendNano('org_down')).resolves.toBe(0);

    fakeRedis.get.mockRejectedValueOnce(new Error('redis read failed'));
    await expect(enforceSpendCap('org_down', { dailyLLMSpendCapUsd: 1 })).resolves.toBeUndefined();

    fakeRedis.incrby.mockRejectedValueOnce(new Error('redis write failed'));
    await expect(recordSpend('org_down', USAGE, MODEL)).resolves.toBeUndefined();
  });
});
