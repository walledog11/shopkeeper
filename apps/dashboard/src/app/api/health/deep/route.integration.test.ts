import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPing, mockGetRedis, mockValidateEnv } = vi.hoisted(() => ({
  mockPing: vi.fn(),
  mockGetRedis: vi.fn(),
  mockValidateEnv: vi.fn(),
}));

// Redis and env are the two dependencies that can be made to fail on demand.
// The DB stays real — the aggregation under test treats every failed check
// identically, so proving it on Redis proves it for all three.
vi.mock('@/lib/server/redis', () => ({ getRedis: mockGetRedis }));

vi.mock('@/lib/env', () => ({
  validateDashboardEnv: mockValidateEnv,
  getDashboardRedisEnv: () => ({ url: 'http://unused', token: 'unused' }),
}));

vi.mock('@/lib/server/logger', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { GET } from './route';

type DeepHealth = {
  status: string;
  checks: Record<string, { status: string }>;
};

beforeEach(() => {
  mockValidateEnv.mockReturnValue(undefined);
  mockPing.mockResolvedValue('PONG');
  mockGetRedis.mockReturnValue({ ping: mockPing });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/health/deep', () => {
  it('returns 200 and marks every check ok when all dependencies answer', async () => {
    const response = await GET();
    const body = (await response.json()) as DeepHealth;

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    // The DB entry is a real round trip, not a stub.
    expect(body.checks).toEqual({
      env: { status: 'ok' },
      db: { status: 'ok' },
      redis: { status: 'ok' },
    });
  });

  it('degrades to 503 when env validation throws', async () => {
    mockValidateEnv.mockImplementation(() => {
      throw new Error('missing APP_URL');
    });

    const response = await GET();
    const body = (await response.json()) as DeepHealth;

    expect(response.status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.checks.env).toEqual({ status: 'error' });
    // A failing check must not suppress the others — the point of the endpoint
    // is telling you which dependency is down, not just that one is.
    expect(body.checks.db).toEqual({ status: 'ok' });
    expect(body.checks.redis).toEqual({ status: 'ok' });
  });

  it('degrades to 503 when Redis throws', async () => {
    mockPing.mockRejectedValue(new Error('ECONNREFUSED'));

    const response = await GET();
    const body = (await response.json()) as DeepHealth;

    expect(response.status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.checks.redis).toEqual({ status: 'error' });
    expect(body.checks.env).toEqual({ status: 'ok' });
  });

  it('treats a non-PONG Redis reply as a failure rather than a pass', async () => {
    // A reachable Redis answering something unexpected is still unhealthy;
    // the check asserts the reply, not merely that the call resolved.
    mockPing.mockResolvedValue('WEIRD');

    const response = await GET();
    const body = (await response.json()) as DeepHealth;

    expect(response.status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.checks.redis).toEqual({ status: 'error' });
  });

  it('never leaks the underlying error text to the caller', async () => {
    mockPing.mockRejectedValue(new Error('redis://user:hunter2@10.0.0.4:6379'));

    const response = await GET();
    const raw = JSON.stringify(await response.json());

    expect(raw).not.toContain('hunter2');
    expect(raw).not.toContain('10.0.0.4');
  });
});
