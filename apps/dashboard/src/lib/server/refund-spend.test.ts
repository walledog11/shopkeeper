import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  getDailyRefundSpendCents as GetDailyRefundSpendCentsFn,
  incrementDailyRefundSpendCents as IncrementDailyRefundSpendCentsFn,
} from './refund-spend';
import type { getRedis as GetRedisFn } from './redis';

vi.mock('@/lib/server/redis', () => ({
  getRedis: vi.fn(),
}));

let getDailyRefundSpendCents: typeof GetDailyRefundSpendCentsFn;
let incrementDailyRefundSpendCents: typeof IncrementDailyRefundSpendCentsFn;
let mockedGetRedis: ReturnType<typeof vi.mocked<GetRedisFn>>;

function makeFakeRedis() {
  const store = new Map<string, number>();
  return {
    store,
    get: vi.fn(async (key: string) => {
      const value = store.get(key);
      return value === undefined ? null : String(value);
    }),
    incrby: vi.fn(async (key: string, delta: number) => {
      const next = (store.get(key) ?? 0) + delta;
      store.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
  };
}

describe('refund-spend', () => {
  beforeAll(async () => {
    ({ getDailyRefundSpendCents, incrementDailyRefundSpendCents } = await import('./refund-spend'));
    ({ getRedis: mockedGetRedis } = await import('./redis').then(({ getRedis }) => ({
      getRedis: vi.mocked(getRedis),
    })));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when no spend is recorded today', async () => {
    const fake = makeFakeRedis();
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof GetRedisFn>);

    const spent = await getDailyRefundSpendCents('org_1');

    expect(spent).toBe(0);
  });

  it('returns the current total after an increment', async () => {
    const fake = makeFakeRedis();
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof GetRedisFn>);

    await incrementDailyRefundSpendCents('org_1', 1500);
    await incrementDailyRefundSpendCents('org_1', 750);

    const spent = await getDailyRefundSpendCents('org_1');
    expect(spent).toBe(2250);
  });

  it('sets TTL only on the first increment of the day', async () => {
    const fake = makeFakeRedis();
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof GetRedisFn>);

    await incrementDailyRefundSpendCents('org_2', 100);
    await incrementDailyRefundSpendCents('org_2', 200);

    expect(fake.expire).toHaveBeenCalledTimes(1);
  });

  it('ignores non-positive or non-finite deltas', async () => {
    const fake = makeFakeRedis();
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof GetRedisFn>);

    await incrementDailyRefundSpendCents('org_3', 0);
    await incrementDailyRefundSpendCents('org_3', -50);
    await incrementDailyRefundSpendCents('org_3', NaN);

    expect(fake.incrby).not.toHaveBeenCalled();
    expect(await getDailyRefundSpendCents('org_3')).toBe(0);
  });

  it('isolates spend by org', async () => {
    const fake = makeFakeRedis();
    mockedGetRedis.mockReturnValue(fake as unknown as ReturnType<typeof GetRedisFn>);

    await incrementDailyRefundSpendCents('org_a', 100);
    await incrementDailyRefundSpendCents('org_b', 500);

    expect(await getDailyRefundSpendCents('org_a')).toBe(100);
    expect(await getDailyRefundSpendCents('org_b')).toBe(500);
  });
});
