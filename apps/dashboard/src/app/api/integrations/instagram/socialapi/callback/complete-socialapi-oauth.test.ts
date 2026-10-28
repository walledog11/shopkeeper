import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { exchangeInstagramCode, getInstagramAccount, persist } = vi.hoisted(() => ({
  exchangeInstagramCode: vi.fn(),
  getInstagramAccount: vi.fn(),
  persist: vi.fn(),
}));

vi.mock('@shopkeeper/integrations/socialapi', () => ({
  createSocialApiClient: () => ({ exchangeInstagramCode, getInstagramAccount }),
  SOCIALAPI_PRODUCTION_BASE_URL: 'https://api.social-api.ai/v1',
}));

vi.mock('@/app/api/integrations/_lib/socialapi-connection', () => ({
  persistSocialApiConnection: persist,
}));

import { InstagramAccountInUseError } from '@/app/api/integrations/_lib/instagram-connection';
import { completeSocialApiOAuth } from './complete-socialapi-oauth';

const ATTEMPT = 'b'.repeat(32);

function input(overrides: Partial<Parameters<typeof completeSocialApiOAuth>[0]> = {}) {
  return {
    appUrl: 'https://app.example.com',
    attemptState: ATTEMPT,
    clerkOrganizationId: 'org_assigned',
    code: 'auth-code',
    organizationId: 'db-org-id',
    providerState: 'provider-state',
    savedBrandId: 'brand_1',
    savedProviderState: 'provider-state',
    ...overrides,
  };
}

describe('completeSocialApiOAuth', () => {
  beforeEach(() => {
    vi.stubEnv('SOCIALAPI_ENABLED', 'true');
    vi.stubEnv('SOCIALAPI_API_KEY', 'sapi-key');
    vi.stubEnv('SOCIALAPI_BRAND_ASSIGNMENTS', 'org_assigned:brand_1');
    exchangeInstagramCode.mockResolvedValue({
      ok: true,
      data: { accountId: 'acc_1', platform: 'instagram', username: 'merchant' },
      httpStatus: 200,
      requestId: null,
    });
    getInstagramAccount.mockResolvedValue({
      ok: true,
      data: {
        id: 'acc_1',
        brandId: 'brand_1',
        platform: 'instagram',
        username: 'merchant',
        name: 'Merchant',
        status: 'active',
        reconnectReason: null,
      },
      httpStatus: 200,
      requestId: null,
    });
    persist.mockResolvedValue({
      integration: { id: 'integration-1' },
      replacedIntegrationId: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('exchanges with the redirect URI connect used and persists the verified account', async () => {
    const result = await completeSocialApiOAuth(input());

    expect(result).toEqual({ ok: true, integrationId: 'integration-1' });
    expect(exchangeInstagramCode).toHaveBeenCalledWith({
      code: 'auth-code',
      redirectUri:
        `https://app.example.com/api/integrations/instagram/socialapi/callback?attempt=${ATTEMPT}`,
      state: 'provider-state',
    });
    // The account is verified against the assigned brand, never against a brand
    // the callback carried.
    expect(getInstagramAccount).toHaveBeenCalledWith({ accountId: 'acc_1', brandId: 'brand_1' });
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 'brand_1',
      organizationId: 'db-org-id',
      providerAccountId: 'acc_1',
      username: 'merchant',
    }));
  });

  it('rejects a provider state that does not match the started attempt', async () => {
    const result = await completeSocialApiOAuth(input({ providerState: 'someone-elses-state' }));

    expect(result).toEqual({
      ok: false,
      error: 'state_mismatch',
      failureCategory: 'state_mismatch',
    });
    expect(exchangeInstagramCode).not.toHaveBeenCalled();
  });

  it('rejects a callback for a workspace that lost its assignment', async () => {
    vi.stubEnv('SOCIALAPI_BRAND_ASSIGNMENTS', 'org_other:brand_9');

    const result = await completeSocialApiOAuth(input());

    expect(result).toEqual({
      ok: false,
      error: 'instagram_not_available',
      failureCategory: 'validation_failed',
    });
    expect(exchangeInstagramCode).not.toHaveBeenCalled();
  });

  it('rejects a callback whose assigned brand changed mid-flow', async () => {
    const result = await completeSocialApiOAuth(input({ savedBrandId: 'brand_stale' }));

    expect(result).toMatchObject({ ok: false, error: 'instagram_not_available' });
    expect(exchangeInstagramCode).not.toHaveBeenCalled();
  });

  // Persisting an account the vendor already wants reconnected would finish the
  // OAuth flow and then deliver nothing — the exact failure this transport exists
  // to avoid.
  it('refuses an account that is not ready to receive DMs', async () => {
    getInstagramAccount.mockResolvedValue({
      ok: true,
      data: {
        id: 'acc_1',
        brandId: 'brand_1',
        platform: 'instagram',
        username: 'merchant',
        name: null,
        status: 'active',
        reconnectReason: 'token_expired',
      },
      httpStatus: 200,
      requestId: null,
    });

    const result = await completeSocialApiOAuth(input());

    expect(result).toEqual({
      ok: false,
      error: 'instagram_account_not_ready',
      failureCategory: 'validation_failed',
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it('refuses an account that did not land in the workspace brand', async () => {
    getInstagramAccount.mockResolvedValue({
      ok: false,
      error: {
        category: 'validation',
        httpStatus: 200,
        code: null,
        message: 'SocialAPI Instagram account was not found for the assigned brand',
        requestId: null,
      },
    });

    const result = await completeSocialApiOAuth(input());

    expect(result).toEqual({
      ok: false,
      error: 'invalid_callback',
      failureCategory: 'validation_failed',
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it('maps a failed exchange to a token failure with the provider category', async () => {
    exchangeInstagramCode.mockResolvedValue({
      ok: false,
      error: {
        category: 'authentication',
        httpStatus: 401,
        code: null,
        message: 'bad code',
        requestId: null,
      },
    });

    const result = await completeSocialApiOAuth(input());

    expect(result).toEqual({
      ok: false,
      error: 'token_exchange_failed',
      failureCategory: 'invalid_credentials',
    });
  });

  it('reports an account another workspace already holds', async () => {
    persist.mockRejectedValue(new InstagramAccountInUseError());

    const result = await completeSocialApiOAuth(input());

    expect(result).toEqual({
      ok: false,
      error: 'instagram_account_in_use',
      failureCategory: 'validation_failed',
    });
  });
});
