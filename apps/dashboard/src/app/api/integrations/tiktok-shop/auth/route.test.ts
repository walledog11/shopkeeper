import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCookieSet } = vi.hoisted(() => ({
  mockCookieSet: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    set: mockCookieSet,
  })),
}));

import { auth } from '@clerk/nextjs/server';
import { POST } from './route';

beforeEach(() => {
  vi.stubEnv('APP_URL', 'http://dashboard.test');
  vi.stubEnv('TIKTOK_SHOP_ENABLED', 'true');
  vi.stubEnv('TIKTOK_SHOP_APP_KEY', 'tts-app-key');
  vi.stubEnv('TIKTOK_SHOP_AUTH_URL', 'https://auth.tiktok.test/oauth/authorize');
  vi.stubEnv('TIKTOK_SHOP_SCOPES', 'buyer.message,shop.info');
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_oauth',
    orgId: 'org_oauth',
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockCookieSet.mockClear();
});

describe('POST /api/integrations/tiktok-shop/auth', () => {
  it('sets OAuth state cookies and redirects to TikTok Shop authorization', async () => {
    const res = await POST(new Request('http://localhost/api/integrations/tiktok-shop/auth?returnTo=/dashboard/integrations'));

    expect(res.status).toBe(307);
    const redirectUrl = new URL(res.headers.get('location')!);
    expect(redirectUrl.origin).toBe('https://auth.tiktok.test');
    expect(redirectUrl.searchParams.get('app_key')).toBe('tts-app-key');
    expect(redirectUrl.searchParams.get('client_key')).toBe('tts-app-key');
    expect(redirectUrl.searchParams.get('redirect_uri')).toBe('http://dashboard.test/api/integrations/tiktok-shop/callback');
    expect(redirectUrl.searchParams.get('response_type')).toBe('code');
    expect(redirectUrl.searchParams.get('scope')).toBe('buyer.message,shop.info');
    expect(redirectUrl.searchParams.get('state')).toMatch(/^[a-f0-9]{32}$/);

    expect(mockCookieSet).toHaveBeenCalledWith('tiktok_shop_oauth_state', redirectUrl.searchParams.get('state'), expect.objectContaining({ httpOnly: true }));
    expect(mockCookieSet).toHaveBeenCalledWith('tiktok_shop_oauth_org', 'org_oauth', expect.any(Object));
    expect(mockCookieSet).toHaveBeenCalledWith('tiktok_shop_oauth_user', 'usr_oauth', expect.any(Object));
    expect(mockCookieSet).toHaveBeenCalledWith('tiktok_shop_oauth_return', '/dashboard/integrations', expect.any(Object));
  });

  it('returns 500 when enabled but provider OAuth config is incomplete', async () => {
    vi.stubEnv('TIKTOK_SHOP_AUTH_URL', '');

    const res = await POST(new Request('http://localhost/api/integrations/tiktok-shop/auth'));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'TikTok Shop OAuth is not configured' });
  });
});
