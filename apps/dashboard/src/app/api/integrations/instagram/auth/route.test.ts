import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createSessionCookies, requireSession, startSocialApi } = vi.hoisted(() => ({
  createSessionCookies: vi.fn(),
  requireSession: vi.fn(),
  startSocialApi: vi.fn(),
}));

vi.mock('@/app/api/integrations/_lib/oauth-session', () => ({
  createOAuthSessionCookies: createSessionCookies,
  requireAuthenticatedOAuthSession: requireSession,
}));

vi.mock('./socialapi-connect', () => ({
  startSocialApiInstagramConnect: startSocialApi,
}));

import { POST } from './route';

describe('POST /api/integrations/instagram/auth', () => {
  beforeEach(() => {
    vi.stubEnv('APP_URL', 'https://dashboard.example.com');
    vi.stubEnv('INSTAGRAM_APP_ID', 'instagram-app-id');
    vi.stubEnv('INSTAGRAM_INTEGRATION_ENABLED', 'true');
    requireSession.mockResolvedValue({
      ok: true,
      session: { orgId: 'org_123', userId: 'user_123' },
    });
    createSessionCookies.mockResolvedValue({ state: 'state_123', returnTo: null });
    startSocialApi.mockResolvedValue(new Response(null, { status: 303 }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('starts direct Instagram OAuth with the required scopes and reauthentication', async () => {
    const request = new Request('http://localhost/api/integrations/instagram/auth', {
      method: 'POST',
    });

    const response = await POST(request);

    // The popup starts this route with POST; Instagram's authorize endpoint
    // must be opened with GET, so the redirect must not preserve the method.
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin + location.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(Object.fromEntries(location.searchParams)).toEqual({
      client_id: 'instagram-app-id',
      redirect_uri: 'https://dashboard.example.com/api/integrations/instagram/callback',
      response_type: 'code',
      scope: 'instagram_business_basic,instagram_business_manage_messages',
      state: 'state_123',
      enable_fb_login: 'false',
      force_reauth: 'true',
    });
    expect(createSessionCookies).toHaveBeenCalledWith(
      request,
      { provider: 'instagram' },
      { orgId: 'org_123', userId: 'user_123' },
    );
  });

  it('requires an authenticated workspace session', async () => {
    requireSession.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await POST(new Request('http://localhost', { method: 'POST' }));

    expect(response.status).toBe(401);
    expect(createSessionCookies).not.toHaveBeenCalled();
  });

  it('passes the admin denial through when a member starts the connect flow', async () => {
    requireSession.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Only workspace admins can do this.' }, { status: 403 }),
    });

    const response = await POST(new Request('http://localhost', { method: 'POST' }));

    expect(response.status).toBe(403);
    expect(createSessionCookies).not.toHaveBeenCalled();
  });

  it('fails before creating state when Instagram OAuth is not configured', async () => {
    vi.stubEnv('INSTAGRAM_APP_ID', '');

    const response = await POST(new Request('http://localhost', { method: 'POST' }));

    expect(response.status).toBe(500);
    expect(createSessionCookies).not.toHaveBeenCalled();
  });

  it('refuses to start direct OAuth for a workspace outside the allowlist', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('INSTAGRAM_BETA_ORG_IDS', 'org_beta');

    const response = await POST(new Request('http://localhost/api/integrations/instagram/auth', {
      method: 'POST',
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'instagram_not_available' });
    expect(createSessionCookies).not.toHaveBeenCalled();
  });

  it('starts direct OAuth for an allowlisted workspace', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('INSTAGRAM_BETA_ORG_IDS', 'org_beta,org_123');

    const response = await POST(new Request('http://localhost/api/integrations/instagram/auth', {
      method: 'POST',
    }));

    expect(response.status).toBe(303);
    expect(createSessionCookies).toHaveBeenCalledOnce();
  });

  // The card links to one connect entry point for the channel. Which transport
  // it starts is resolved here, so an assigned workspace must never reach the
  // direct-Meta authorize URL even while the direct flag is still on.
  it('hands an assigned workspace to SocialAPI instead of direct Meta', async () => {
    vi.stubEnv('SOCIALAPI_ENABLED', 'true');
    vi.stubEnv('SOCIALAPI_API_KEY', 'sapi-key');
    vi.stubEnv('SOCIALAPI_BRAND_ASSIGNMENTS', 'org_123:brand_1');

    const request = new Request('http://localhost/api/integrations/instagram/auth', {
      method: 'POST',
    });
    await POST(request);

    expect(startSocialApi).toHaveBeenCalledWith(request, { orgId: 'org_123', userId: 'user_123' });
    expect(createSessionCookies).not.toHaveBeenCalled();
  });

  it('leaves an unassigned workspace on direct Meta while that flag is open', async () => {
    vi.stubEnv('SOCIALAPI_ENABLED', 'true');
    vi.stubEnv('SOCIALAPI_API_KEY', 'sapi-key');
    vi.stubEnv('SOCIALAPI_BRAND_ASSIGNMENTS', 'org_other:brand_1');

    const response = await POST(new Request('http://localhost/api/integrations/instagram/auth', {
      method: 'POST',
    }));

    expect(startSocialApi).not.toHaveBeenCalled();
    expect(new URL(response.headers.get('location')!).origin).toBe('https://www.instagram.com');
  });
});
