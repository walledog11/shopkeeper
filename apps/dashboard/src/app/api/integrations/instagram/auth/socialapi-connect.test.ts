import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { beginInstagramConnect, createSessionCookies, createState } = vi.hoisted(() => ({
  beginInstagramConnect: vi.fn(),
  createSessionCookies: vi.fn(),
  createState: vi.fn(),
}));

vi.mock('@shopkeeper/integrations/socialapi', () => ({
  createSocialApiClient: () => ({ beginInstagramConnect }),
  SOCIALAPI_PRODUCTION_BASE_URL: 'https://api.social-api.ai/v1',
}));

vi.mock('@/app/api/integrations/_lib/oauth-session', () => ({
  createOAuthSessionCookies: createSessionCookies,
  createOAuthState: createState,
}));

import { socialApiRedirectUri, startSocialApiInstagramConnect } from './socialapi-connect';

const SESSION = { orgId: 'org_assigned', userId: 'user_1' };
const ATTEMPT = 'a'.repeat(32);

function request() {
  return new Request('http://localhost/api/integrations/instagram/auth', { method: 'POST' });
}

describe('startSocialApiInstagramConnect', () => {
  beforeEach(() => {
    vi.stubEnv('APP_URL', 'https://app.example.com');
    vi.stubEnv('SOCIALAPI_ENABLED', 'true');
    vi.stubEnv('SOCIALAPI_API_KEY', 'sapi-key');
    vi.stubEnv('SOCIALAPI_BRAND_ASSIGNMENTS', 'org_assigned:brand_1');
    createState.mockReturnValue(ATTEMPT);
    createSessionCookies.mockResolvedValue({ state: ATTEMPT, returnTo: null, mode: 'popup' });
    beginInstagramConnect.mockResolvedValue({
      ok: true,
      data: { authUrl: 'https://social-api.example/authorize?x=1', state: 'provider-state' },
      httpStatus: 200,
      requestId: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('sends our correlation state in the redirect URI, not the provider state parameter', async () => {
    const response = await startSocialApiInstagramConnect(request(), SESSION);

    // The popup starts the flow with POST; the provider's consent page must be
    // opened with GET, so the redirect must not preserve the method.
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://social-api.example/authorize?x=1');
    expect(beginInstagramConnect).toHaveBeenCalledWith({
      brandId: 'brand_1',
      redirectUri:
        'https://app.example.com/api/integrations/instagram/socialapi/callback?attempt=' + ATTEMPT,
    });
  });

  it('seals the provider state and assigned brand into the attempt cookie', async () => {
    await startSocialApiInstagramConnect(request(), SESSION);

    expect(createSessionCookies).toHaveBeenCalledWith(
      expect.anything(),
      { provider: 'instagram' },
      SESSION,
      { socialApiState: 'provider-state', socialApiBrandId: 'brand_1' },
      ATTEMPT,
    );
  });

  it('refuses a workspace with no assigned brand', async () => {
    const response = await startSocialApiInstagramConnect(request(), { ...SESSION, orgId: 'org_x' });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'instagram_not_available' });
    expect(beginInstagramConnect).not.toHaveBeenCalled();
  });

  // A vendor outage must not leave a sealed attempt behind that a later callback
  // could pair with a code we never asked for.
  it('writes no attempt cookie when the provider cannot start the flow', async () => {
    beginInstagramConnect.mockResolvedValue({
      ok: false,
      error: {
        category: 'transient_provider_failure',
        httpStatus: 503,
        code: null,
        message: 'unavailable',
        requestId: null,
      },
    });

    const response = await startSocialApiInstagramConnect(request(), SESSION);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'provider_unavailable' });
    expect(createSessionCookies).not.toHaveBeenCalled();
  });
});

describe('socialApiRedirectUri', () => {
  it('is stable across connect and exchange', () => {
    expect(socialApiRedirectUri('https://app.example.com', ATTEMPT)).toBe(
      `https://app.example.com/api/integrations/instagram/socialapi/callback?attempt=${ATTEMPT}`,
    );
  });
});
