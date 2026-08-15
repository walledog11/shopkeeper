import { afterEach, describe, expect, it, vi } from 'vitest';

const setServers = vi.fn();
const validateDashboardEnv = vi.fn();

vi.mock('dns', () => ({ setServers }));
vi.mock('@sentry/nextjs', () => ({ captureRequestError: vi.fn() }));
vi.mock('@/lib/env', () => ({ validateDashboardEnv }));
vi.mock('./sentry.server.config', () => ({}));
vi.mock('./sentry.edge.config', () => ({}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('dashboard instrumentation', () => {
  it('leaves the platform DNS resolver configuration untouched by default', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    const { register } = await import('./instrumentation');

    await register();

    expect(validateDashboardEnv).toHaveBeenCalledOnce();
    expect(setServers).not.toHaveBeenCalled();
  });
});
