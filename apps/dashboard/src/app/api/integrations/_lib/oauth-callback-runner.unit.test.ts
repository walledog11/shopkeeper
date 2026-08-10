import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCaptureCompleted,
  mockCaptureFailed,
  mockCaptureOAuthFailed,
  mockLogger,
  mockResolveOrganization,
  mockValidateSession,
} = vi.hoisted(() => ({
  mockCaptureCompleted: vi.fn(),
  mockCaptureFailed: vi.fn(),
  mockCaptureOAuthFailed: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  mockResolveOrganization: vi.fn(),
  mockValidateSession: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({ default: mockLogger }));
vi.mock('@/lib/server/product-analytics', () => ({
  captureIntegrationConnectionCompleted: mockCaptureCompleted,
  captureIntegrationConnectionFailed: mockCaptureFailed,
  captureOAuthIntegrationConnectionFailed: mockCaptureOAuthFailed,
}));
vi.mock('./oauth-session', () => ({
  validateOAuthCallbackSession: mockValidateSession,
}));
vi.mock('./oauth-callback', () => ({
  resolveOAuthOrganization: mockResolveOrganization,
  oauthCompleteResponse: (
    appUrl: string,
    input: {
      mode?: string;
      outcome: { error?: string; provider: string; status: string };
      returnTo?: string | null;
    },
  ) => {
    const url = new URL('/dashboard/integrations/oauth/complete', appUrl);
    url.searchParams.set('provider', input.outcome.provider);
    url.searchParams.set('status', input.outcome.status);
    if (input.outcome.error) url.searchParams.set('error', input.outcome.error);
    if (input.mode) url.searchParams.set('mode', input.mode);
    if (input.returnTo) url.searchParams.set('returnTo', input.returnTo);
    return new Response(null, { status: 303, headers: { location: url.toString() } });
  },
}));

import { runOAuthCallback } from './oauth-callback-runner';

const STATE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const descriptor = {
  analyticsPlatform: 'email',
  appUrl: 'https://dashboard.test',
  codeAliases: ['code', 'auth_code'],
  invalidCallbackError: 'invalid_callback',
  logPrefix: 'Test OAuth',
  provider: 'gmail',
  serverError: 'server_error',
  stateMismatchError: 'state_mismatch',
} as const;
const session = {
  attemptId: STATE,
  clerkOrgId: 'clerk_org_1',
  extra: {},
  mode: 'redirect' as const,
  returnTo: '/dashboard/settings',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateSession.mockResolvedValue({ ok: true, session });
  mockResolveOrganization.mockResolvedValue({ ok: true, org: { id: 'org_1' } });
});

describe('runOAuthCallback', () => {
  it('rejects a missing state without running or attributing the attempt', async () => {
    const complete = vi.fn();
    mockValidateSession.mockResolvedValueOnce({
      ok: false,
      analyticsContext: {},
    });
    const response = await run('code=oauth_code', complete);

    expect(location(response)).toBe(
      'https://dashboard.test/dashboard/integrations/oauth/complete?provider=gmail&status=failed&error=state_mismatch',
    );
    expect(mockValidateSession).toHaveBeenCalledWith(expect.objectContaining({ state: null }));
    expect(complete).not.toHaveBeenCalled();
    expect(mockCaptureFailed).not.toHaveBeenCalled();
  });

  it('returns a state mismatch and records only attributable validation context', async () => {
    mockValidateSession.mockResolvedValueOnce({
      ok: false,
      analyticsContext: { attemptId: STATE, clerkOrganizationId: 'clerk_org_1' },
    });

    const response = await run(`code=oauth_code&state=${STATE}`, vi.fn());

    expect(location(response)).toBe(
      'https://dashboard.test/dashboard/integrations/oauth/complete?provider=gmail&status=failed&error=state_mismatch',
    );
    expect(mockCaptureOAuthFailed).toHaveBeenCalledWith({
      attemptId: STATE,
      clerkOrganizationId: 'clerk_org_1',
      failureCategory: 'state_mismatch',
      platform: 'email',
    });
  });

  it('preserves navigation context for an authorization mismatch', async () => {
    mockValidateSession.mockResolvedValueOnce({
      ok: false,
      analyticsContext: { attemptId: STATE, clerkOrganizationId: 'clerk_org_1' },
      navigation: { mode: 'redirect', returnTo: '/dashboard/settings' },
    });

    expect(location(await run(`code=oauth_code&state=${STATE}`, vi.fn()))).toBe(
      'https://dashboard.test/dashboard/integrations/oauth/complete?provider=gmail&status=failed&error=state_mismatch&mode=redirect&returnTo=%2Fdashboard%2Fsettings',
    );
  });

  it('handles uncorrelated cancellation without attempt analytics', async () => {
    const response = await run('error=access_denied', vi.fn());

    expect(location(response)).toContain('status=failed&error=access_denied');
    expect(mockValidateSession).not.toHaveBeenCalled();
    expect(mockCaptureFailed).not.toHaveBeenCalled();
    expect(mockCaptureOAuthFailed).not.toHaveBeenCalled();
  });

  it('attributes correlated cancellation and preserves navigation context', async () => {
    const response = await run(`error=access_denied&state=${STATE}`, vi.fn());

    expect(location(response)).toBe(
      'https://dashboard.test/dashboard/integrations/oauth/complete?provider=gmail&status=failed&error=access_denied&mode=redirect&returnTo=%2Fdashboard%2Fsettings',
    );
    expect(mockCaptureFailed).toHaveBeenCalledWith({
      attemptId: STATE,
      failureCategory: 'access_denied',
      organizationId: 'org_1',
      platform: 'email',
    });
  });

  it('returns a server error when organization resolution fails', async () => {
    mockResolveOrganization.mockResolvedValueOnce({ ok: false, error: 'server_error' });

    const response = await run(`code=oauth_code&state=${STATE}`, vi.fn());

    expect(location(response)).toContain('error=server_error&mode=redirect');
    expect(mockCaptureOAuthFailed).toHaveBeenCalledWith(expect.objectContaining({
      failureCategory: 'unknown',
    }));
  });

  it('records exactly one completion and redirects after success', async () => {
    const complete = vi.fn().mockResolvedValue({ ok: true, integrationId: 'integration_1' });

    const response = await run(`auth_code=oauth_code&state=${STATE}`, complete);

    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      code: 'oauth_code',
      organizationId: 'org_1',
    }));
    expect(mockCaptureCompleted).toHaveBeenCalledTimes(1);
    expect(mockCaptureCompleted).toHaveBeenCalledWith({
      integrationId: 'integration_1',
      organizationId: 'org_1',
      platform: 'email',
    });
    expect(mockCaptureFailed).not.toHaveBeenCalled();
    expect(location(response)).toContain('status=connected&mode=redirect');
  });

  it('redirects and records a typed expected provider failure', async () => {
    const response = await run(`code=oauth_code&state=${STATE}`, vi.fn().mockResolvedValue({
      ok: false,
      error: 'token_exchange_failed',
      failureCategory: 'rate_limited',
    }));

    expect(location(response)).toContain('error=token_exchange_failed&mode=redirect');
    expect(mockCaptureFailed).toHaveBeenCalledWith(expect.objectContaining({
      failureCategory: 'rate_limited',
    }));
    expect(mockCaptureCompleted).not.toHaveBeenCalled();
  });

  it('maps unexpected exceptions to server_error and unknown without logging secrets', async () => {
    const response = await run(
      `code=oauth_code&state=${STATE}`,
      vi.fn().mockRejectedValue(new Error('access_token=secret')),
    );

    expect(location(response)).toContain('error=server_error&mode=redirect');
    expect(mockCaptureFailed).toHaveBeenCalledWith(expect.objectContaining({
      failureCategory: 'unknown',
    }));
    expect(mockLogger.error).toHaveBeenCalledWith(
      { errorClass: 'Error' },
      '[Test OAuth] Unexpected error',
    );
  });

  it('keeps a successful callback successful when analytics fails', async () => {
    mockCaptureCompleted.mockRejectedValueOnce(new Error('telemetry unavailable'));

    const response = await run(`code=oauth_code&state=${STATE}`, vi.fn().mockResolvedValue({
      ok: true,
      integrationId: 'integration_1',
    }));

    expect(location(response)).toContain('status=connected&mode=redirect');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { errorClass: 'Error', event: 'completion', platform: 'email' },
      '[Test OAuth] Analytics capture failed',
    );
  });
});

function run(query: string, complete: Parameters<typeof runOAuthCallback>[0]['complete']) {
  return runOAuthCallback({
    complete,
    descriptor,
    request: new Request(`https://callback.test/oauth?${query}`),
  });
}

function location(response: Response): string {
  return response.headers.get('location') ?? '';
}
