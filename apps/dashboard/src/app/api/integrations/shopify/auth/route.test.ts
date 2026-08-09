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
    orgRole: 'org:admin',
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

    // 303 so the popup shell's POST becomes a GET on the hop to Shopify.
    expect(res.status).toBe(303);
    const redirectUrl = new URL(res.headers.get('location')!);
    expect(redirectUrl.origin).toBe('https://fixture-shop.myshopify.com');
    expect(redirectUrl.pathname).toBe('/admin/oauth/authorize');
    expect(redirectUrl.searchParams.get('client_id')).toBe('shopify-client-id');
    expect(redirectUrl.searchParams.get('redirect_uri')).toBe('http://dashboard.test/api/integrations/shopify/callback');
    expect(redirectUrl.searchParams.get('state')).toMatch(/^[a-f0-9]{32}$/);

    expect(mockCookieSet).toHaveBeenCalledWith(
      `shopify_oauth_attempt_${redirectUrl.searchParams.get('state')}`,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, maxAge: 600 }),
    );
    const attempt = JSON.parse(Buffer.from(mockCookieSet.mock.calls[0][1], 'base64url').toString());
    expect(attempt).toMatchObject({
      userId: 'usr_oauth',
      orgId: 'org_oauth',
      returnTo: '/dashboard/integrations',
      extra: { shop: 'fixture-shop.myshopify.com' },
    });
  });
});
