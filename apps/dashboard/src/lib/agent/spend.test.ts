import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SPEND_KEY_TTL_SECONDS,
  SpendCapError,
  spendKey,
  usageToNanoDollars,
  usdToNanoDollars,
} from '@clerk/db';
import { getRedis } from '@/lib/server/redis';
import { AGENT_SETTINGS_DEFAULTS } from './settings';
import { enforceSpendCap, getDailySpendNano, recordSpend } from './spend';

vi.mock('@/lib/server/redis', () => ({
  getRedis: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const MODEL = 'claude-haiku-4-5-20251001';
const USAGE = {
  inputTokens: 3,
  outputTokens: 5,
  cacheCreationInputTokens: 7,
  cacheReadInputTokens: 11,
};

const mockedGetRedis = vi.mocked(getRedis);

function makeSettings(dailyLLMSpendCapUsd: number | null) {
  return {
    ...AGENT_SETTINGS_DEFAULTS,
    dailyLLMSpendCapUsd,
  };
}

function makeFakeRedis() {
  const store = new Map<string, number | string>();

  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    incrby: vi.fn(async (key: string, delta: number) => {
      const current = Number(store.get(key) ?? 0);
      const next = current + delta;
      store.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
  };
}

describe('agent spend', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reads missing and non-numeric values as zero', async () => {
    const fake = makeFakeRedis();
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof getRedis>);

    await expect(getDailySpendNano('org_1')).resolves.toBe(0);

    fake.store.set(spendKey('org_1'), 'not-a-number');

    await expect(getDailySpendNano('org_1')).resolves.toBe(0);
  });

  it.each([
    ['meets', usdToNanoDollars(1)],
    ['exceeds', usdToNanoDollars(1) + 1],
  ])('enforces the cap when current spend %s the cap', async (_case, currentSpend) => {
    const fake = makeFakeRedis();
    fake.store.set(spendKey('org_cap'), currentSpend);
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof getRedis>);

    await expect(enforceSpendCap('org_cap', makeSettings(1))).rejects.toBeInstanceOf(SpendCapError);
  });

  it('increments spend and sets TTL only on the first increment', async () => {
    const fake = makeFakeRedis();
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof getRedis>);
    const expectedDelta = usageToNanoDollars(USAGE, MODEL);

    await recordSpend('org_increment', USAGE, MODEL);
    await recordSpend('org_increment', USAGE, MODEL);

    expect(fake.incrby).toHaveBeenCalledTimes(2);
    expect(fake.incrby).toHaveBeenCalledWith(spendKey('org_increment'), expectedDelta);
    expect(fake.store.get(spendKey('org_increment'))).toBe(expectedDelta * 2);
    expect(fake.expire).toHaveBeenCalledTimes(1);
    expect(fake.expire).toHaveBeenCalledWith(spendKey('org_increment'), SPEND_KEY_TTL_SECONDS);
  });

  it('falls back safely when Redis reads or writes fail', async () => {
    const fake = makeFakeRedis();
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof getRedis>);

    fake.get.mockRejectedValueOnce(new Error('redis read failed'));
    await expect(getDailySpendNano('org_down')).resolves.toBe(0);

    fake.get.mockRejectedValueOnce(new Error('redis read failed'));
    await expect(enforceSpendCap('org_down', makeSettings(1))).resolves.toBeUndefined();

    fake.incrby.mockRejectedValueOnce(new Error('redis write failed'));
    await expect(recordSpend('org_down', USAGE, MODEL)).resolves.toBeUndefined();
  });
});
