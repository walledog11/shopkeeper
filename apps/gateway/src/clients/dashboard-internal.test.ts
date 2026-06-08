import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDashboardInternalHeaders } from './dashboard-internal.js';

afterEach(() => {
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
