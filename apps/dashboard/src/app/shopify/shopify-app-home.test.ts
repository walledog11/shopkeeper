import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock('@shopkeeper/db', () => ({ db: { integration: { findFirst } } }));
vi.mock('@/lib/shopify/app-home', () => ({ loadShopifyAppHome: vi.fn() }));

import { withShopifyAppRoute } from '@/lib/shopify/app-route';
import { shopifyAppHomeProxy } from '@/proxy/shopify-app-home';
import { loadShopifyAppHome } from '@/lib/shopify/app-home';
import ShopifyAppHomePage from './page';

const CLIENT_ID = 'shopify-client-id';
const CLIENT_SECRET = 'shopify-client-secret';
const SHOP = 'fixture-shop.myshopify.com';

function sessionToken(secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: CLIENT_ID, sub: '42', exp: now + 60, nbf: now - 1,
  });
  return `${header}.${payload}.${createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')}`;
}

beforeEach(() => {
  vi.stubEnv('APP_URL', 'http://dashboard.test');
  vi.stubEnv('SHOPIFY_CLIENT_ID', CLIENT_ID);
  vi.stubEnv('SHOPIFY_CLIENT_SECRET', CLIENT_SECRET);
  vi.clearAllMocks();
});

describe('Shopify app home', () => {
  // Shopify admin frames the app URL; the site's own framing policy blanked it.
  it("lets the requested shop's admin frame the app home, and nothing else", () => {
    const response = shopifyAppHomeProxy(new NextRequest(`http://localhost/shopify?shop=${SHOP}&embedded=1`));

    expect(response.headers.get('content-security-policy')).toMatch(
      new RegExp(`^frame-ancestors https://${SHOP} https://admin\\.shopify\\.com;`),
    );
  });

  it('never loads a workspace for a token Shopify did not sign', async () => {
    for (const reload of [{}, { shopkeeper_reload: '1' }]) {
      await ShopifyAppHomePage({
        searchParams: Promise.resolve({ shop: SHOP, id_token: sessionToken('not-the-client-secret'), ...reload }),
      });
    }
    expect(loadShopifyAppHome).not.toHaveBeenCalled();

    await ShopifyAppHomePage({ searchParams: Promise.resolve({ shop: SHOP, id_token: sessionToken(CLIENT_SECRET) }) });
    expect(loadShopifyAppHome).toHaveBeenCalledWith(SHOP, expect.any(String), expect.anything());
  });

  it("API routes take the workspace only from the token's shop", async () => {
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const route = withShopifyAppRoute({ context: 'test', errorMessage: 'failed' }, handler);
    const call = (token: string) => route(new Request('http://localhost/api/shopify/app/x', {
      headers: { Authorization: `Bearer ${token}` },
    }));

    const forged = await call(sessionToken('not-the-client-secret'));
    expect(forged.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();

    findFirst.mockResolvedValueOnce({
      organization: { id: 'org-1', name: 'Store', stripeStatus: 'active', lifecycleStatus: 'active' },
    });
    expect((await call(sessionToken(CLIENT_SECRET))).status).toBe(200);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { platform: 'shopify', externalAccountId: SHOP, lifecycleStatus: 'active' },
    }));
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ org: { id: 'org-1', name: 'Store' } }));
  });
});
