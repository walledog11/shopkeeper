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
  vi.stubEnv('SHOPIFY_CLIENT_ID', 'shopify-client-id');
  vi.stubEnv('APP_URL', 'http://dashboard.test');
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_oauth',
    orgId: 'org_oauth',
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockCookieSet.mockClear();
});

describe('POST /api/integrations/shopify/auth', () => {
  it('requires an authenticated organization session', async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      userId: null,
      orgId: null,
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    const res = await POST(new Request('http://localhost/api/integrations/shopify/auth?shop=fixture-shop'));

    expect(res.status).toBe(401);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it('rejects invalid shop domains', async () => {
    const res = await POST(new Request('http://localhost/api/integrations/shopify/auth?shop=https://evil.test'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid shop domain' });
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it('sets OAuth state cookies and redirects to the normalized Shopify auth URL', async () => {
    const res = await POST(new Request('http://localhost/api/integrations/shopify/auth?shop=Fixture-Shop&returnTo=/dashboard/integrations'));

    expect(res.status).toBe(307);
    const redirectUrl = new URL(res.headers.get('location')!);
    expect(redirectUrl.origin).toBe('https://fixture-shop.myshopify.com');
    expect(redirectUrl.pathname).toBe('/admin/oauth/authorize');
    expect(redirectUrl.searchParams.get('client_id')).toBe('shopify-client-id');
    expect(redirectUrl.searchParams.get('redirect_uri')).toBe('http://dashboard.test/api/integrations/shopify/callback');
    expect(redirectUrl.searchParams.get('state')).toMatch(/^[a-f0-9]{32}$/);

    expect(mockCookieSet).toHaveBeenCalledWith('shopify_oauth_state', redirectUrl.searchParams.get('state'), expect.objectContaining({ httpOnly: true }));
    expect(mockCookieSet).toHaveBeenCalledWith('shopify_oauth_org', 'org_oauth', expect.any(Object));
    expect(mockCookieSet).toHaveBeenCalledWith('shopify_oauth_user', 'usr_oauth', expect.any(Object));
    expect(mockCookieSet).toHaveBeenCalledWith('shopify_oauth_shop', 'fixture-shop.myshopify.com', expect.any(Object));
    expect(mockCookieSet).toHaveBeenCalledWith('shopify_oauth_return', '/dashboard/integrations', expect.any(Object));
  });
});
