import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  rateLimit as RateLimitFn,
  isE2ERateLimitBypassEnabled as IsE2ERateLimitBypassEnabledFn,
  isE2ERateLimitForceEnabled as IsE2ERateLimitForceEnabledFn,
} from './rate-limit';
import type { getRedis } from '@/lib/server/redis';

vi.mock('@/lib/server/redis', () => ({
  getRedis: vi.fn(),
}));

const { localRedis } = vi.hoisted(() => ({
  localRedis: { incr: vi.fn(), expire: vi.fn(), on: vi.fn() },
}));
vi.mock('ioredis', () => ({
  Redis: vi.fn(function () { return localRedis; }),
}));

let rateLimit: typeof RateLimitFn;
let isE2ERateLimitBypassEnabled: typeof IsE2ERateLimitBypassEnabledFn;
let isE2ERateLimitForceEnabled: typeof IsE2ERateLimitForceEnabledFn;
let mockedGetRedis: ReturnType<typeof vi.mocked<typeof getRedis>>;

function testEnv(vars: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return vars as NodeJS.ProcessEnv;
}

describe('server rateLimit', () => {
  beforeAll(async () => {
    ({ rateLimit, isE2ERateLimitBypassEnabled, isE2ERateLimitForceEnabled } = await import('./rate-limit'));
    ({ getRedis: mockedGetRedis } = await import('@/lib/server/redis').then(({ getRedis }) => ({
      getRedis: vi.mocked(getRedis),
    })));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
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
    expect(isE2ERateLimitBypassEnabled(testEnv({ NODE_ENV: 'development' }))).toBe(false);
    expect(isE2ERateLimitBypassEnabled(testEnv({ NODE_ENV: 'production', E2E_TEST_RUN: 'true' }))).toBe(false);
    expect(isE2ERateLimitBypassEnabled(testEnv({ NODE_ENV: 'test', E2E_TEST_RUN: 'true' }))).toBe(true);
    expect(isE2ERateLimitBypassEnabled(
      testEnv({ NODE_ENV: 'test', E2E_TEST_RUN: 'true', E2E_RATE_LIMIT_TEST_MODE: 'force-header' }),
      { forceForE2E: true },
    )).toBe(false);
  });

  it.each(['test', 'production'])('enforces browser server limits through local Redis in %s mode', async (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('E2E_TEST_RUN', 'true');
    vi.stubEnv('E2E_SERVER', 'true');
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:56379/0');
    localRedis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect((await rateLimit('browser-reply', 1, 60)).success).toBe(true);
    expect((await rateLimit('browser-reply', 1, 60)).success).toBe(false);
    expect(localRedis.expire).toHaveBeenCalled();
    expect(mockedGetRedis).not.toHaveBeenCalled();
  });

  it('does not select local Redis without an explicit E2E test run', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E_SERVER', 'true');
    vi.stubEnv('E2E_TEST_RUN', 'false');
    mockedGetRedis.mockImplementation(() => { throw new Error('Redis unavailable'); });

    expect((await rateLimit('production-reply')).success).toBe(false);
    expect(localRedis.incr).not.toHaveBeenCalled();
    expect(mockedGetRedis).toHaveBeenCalled();
  });

  it('only forces E2E rate limits for the guarded test mode and explicit option', () => {
    const enabledEnv = testEnv({ NODE_ENV: 'test', E2E_TEST_RUN: 'true', E2E_RATE_LIMIT_TEST_MODE: 'force-header' });

    expect(isE2ERateLimitForceEnabled(enabledEnv, { forceForE2E: true })).toBe(true);
    expect(isE2ERateLimitForceEnabled(enabledEnv)).toBe(false);
    expect(isE2ERateLimitForceEnabled(testEnv({ ...enabledEnv, NODE_ENV: 'production' }), { forceForE2E: true })).toBe(false);
    expect(isE2ERateLimitForceEnabled(testEnv({ ...enabledEnv, E2E_RATE_LIMIT_TEST_MODE: 'off' }), { forceForE2E: true })).toBe(false);
  });
});
