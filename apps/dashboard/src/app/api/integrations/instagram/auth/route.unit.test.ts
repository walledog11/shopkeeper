import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createSessionCookies, requireSession } = vi.hoisted(() => ({
  createSessionCookies: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock('@/app/api/integrations/_lib/oauth-session', () => ({
  createOAuthSessionCookies: createSessionCookies,
  requireAuthenticatedOAuthSession: requireSession,
}));

import { POST } from './route';

describe('POST /api/integrations/instagram/auth', () => {
  beforeEach(() => {
    vi.stubEnv('APP_URL', 'https://dashboard.example.com');
    vi.stubEnv('INSTAGRAM_APP_ID', 'instagram-app-id');
    requireSession.mockResolvedValue({ orgId: 'org_123', userId: 'user_123' });
    createSessionCookies.mockResolvedValue({ state: 'state_123', returnTo: null });
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

    expect(response.status).toBe(307);
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
      { prefix: 'ig' },
      { orgId: 'org_123', userId: 'user_123' },
    );
  });

  it('requires an authenticated workspace session', async () => {
    requireSession.mockResolvedValue(null);

    const response = await POST(new Request('http://localhost', { method: 'POST' }));

    expect(response.status).toBe(401);
    expect(createSessionCookies).not.toHaveBeenCalled();
  });

  it('fails before creating state when Instagram OAuth is not configured', async () => {
    vi.stubEnv('INSTAGRAM_APP_ID', '');

    const response = await POST(new Request('http://localhost', { method: 'POST' }));

    expect(response.status).toBe(500);
    expect(createSessionCookies).not.toHaveBeenCalled();
  });
});
