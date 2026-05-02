import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { rateLimit as RateLimitFn, isE2ERateLimitBypassEnabled as IsE2ERateLimitBypassEnabledFn } from './rate-limit';
import type { getRedis as GetRedisFn } from '@/lib/server/redis';

vi.unmock('@/lib/server/rate-limit');
vi.mock('@/lib/server/redis', () => ({
  getRedis: vi.fn(),
}));

let rateLimit: typeof RateLimitFn;
let isE2ERateLimitBypassEnabled: typeof IsE2ERateLimitBypassEnabledFn;
let mockedGetRedis: ReturnType<typeof vi.mocked<GetRedisFn>>;

describe('server rateLimit', () => {
  beforeAll(async () => {
    ({ rateLimit, isE2ERateLimitBypassEnabled } = await import('./rate-limit'));
    ({ getRedis: mockedGetRedis } = await import('@/lib/server/redis').then(({ getRedis }) => ({
      getRedis: vi.mocked(getRedis),
    })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.doMock('@/lib/server/rate-limit', () => ({
      rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 100, reset: 9999999999 }),
      tooManyRequests: vi.fn(),
    }));
  });

  it('bypasses Redis for explicit non-production E2E runs', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('E2E_TEST_RUN', 'true');

    const result = await rateLimit('e2e-test-key', 5, 60);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(5);
    expect(mockedGetRedis).not.toHaveBeenCalled();
  });

  it('does not allow the E2E bypass in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E_TEST_RUN', 'true');
    mockedGetRedis.mockImplementation(() => {
      throw new Error('Redis unavailable');
    });

    const result = await rateLimit('production-key', 5, 60);

    expect(result.success).toBe(false);
    expect(mockedGetRedis).toHaveBeenCalled();
  });

  it('only enables the E2E bypass when the flag is explicit', () => {
    expect(isE2ERateLimitBypassEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(isE2ERateLimitBypassEnabled({ NODE_ENV: 'production', E2E_TEST_RUN: 'true' })).toBe(false);
    expect(isE2ERateLimitBypassEnabled({ NODE_ENV: 'test', E2E_TEST_RUN: 'true' })).toBe(true);
  });
});
