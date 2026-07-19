import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDashboardInternalHeaders, postDashboardInternal } from './dashboard-internal.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('buildDashboardInternalHeaders', () => {
  it('includes the internal secret and JSON content type', () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'test-internal-secret');

    expect(buildDashboardInternalHeaders()).toEqual({
      'Content-Type': 'application/json',
      'x-internal-secret': 'test-internal-secret',
    });
  });

  it('adds the Vercel protection bypass header when configured', () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'test-internal-secret');
    vi.stubEnv('VERCEL_PROTECTION_BYPASS', 'bypass-token');

    expect(buildDashboardInternalHeaders()).toEqual({
      'Content-Type': 'application/json',
      'x-internal-secret': 'test-internal-secret',
      'x-vercel-protection-bypass': 'bypass-token',
    });
  });

  it('ignores whitespace-only bypass values', () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'test-internal-secret');
    vi.stubEnv('VERCEL_PROTECTION_BYPASS', '   ');

    expect(buildDashboardInternalHeaders()).toEqual({
      'Content-Type': 'application/json',
      'x-internal-secret': 'test-internal-secret',
    });
  });
});

describe('postDashboardInternal', () => {
  it('applies a deadline and returns successful JSON', async () => {
    vi.stubEnv('DASHBOARD_URL', 'https://dashboard.test');
    vi.stubEnv('INTERNAL_API_SECRET', 'test-internal-secret');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ value: 1 })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(postDashboardInternal<{ value: number }>('/api/internal', {
      threadId: 'thread_1',
    })).resolves.toEqual({ ok: true, data: { value: 1 } });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashboard.test/api/internal',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    );
  });

  it('returns unknown when queue or send admission loses its response', async () => {
    vi.stubEnv('DASHBOARD_URL', 'https://dashboard.test');
    vi.stubEnv('INTERNAL_API_SECRET', 'test-internal-secret');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new DOMException('timed out', 'TimeoutError'),
    ));

    await expect(postDashboardInternal('/api/internal', {})).resolves.toMatchObject({
      ok: false,
      outcome: 'unknown',
      status: null,
      responseBody: expect.stringContaining('timed out'),
    });
  });

  it('returns failed for an explicit dashboard rejection', async () => {
    vi.stubEnv('DASHBOARD_URL', 'https://dashboard.test');
    vi.stubEnv('INTERNAL_API_SECRET', 'test-internal-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('rejected', { status: 503 }),
    ));

    await expect(postDashboardInternal('/api/internal', {})).resolves.toEqual({
      ok: false,
      outcome: 'failed',
      status: 503,
      responseBody: 'rejected',
    });
  });
});
