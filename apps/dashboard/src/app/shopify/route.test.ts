import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./_lib/app-home', () => ({
  loadShopifyAppHome: vi.fn(),
}));

import { loadShopifyAppHome } from './_lib/app-home';
import { GET } from './route';

const CLIENT_ID = 'shopify-client-id';
const CLIENT_SECRET = 'shopify-client-secret';
const SHOP = 'fixture-shop.myshopify.com';

function sessionToken(secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    iss: `https://${SHOP}/admin`,
    dest: `https://${SHOP}`,
    aud: CLIENT_ID,
    sub: '42',
    exp: now + 60,
    nbf: now - 1,
    iat: now - 1,
  });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function adminLoad(idToken: string, extra = ''): Request {
  return new Request(
    `http://localhost/shopify?embedded=1&host=aG9zdA&shop=${SHOP}&id_token=${idToken}${extra}`,
  );
}

beforeEach(() => {
  vi.stubEnv('APP_URL', 'http://dashboard.test');
  vi.stubEnv('SHOPIFY_CLIENT_ID', CLIENT_ID);
  vi.stubEnv('SHOPIFY_CLIENT_SECRET', CLIENT_SECRET);
  vi.mocked(loadShopifyAppHome).mockReset();
  vi.mocked(loadShopifyAppHome).mockResolvedValue({ kind: 'unlinked', shop: SHOP });
});

describe('GET /shopify', () => {
  // Shopify admin frames the app URL. The site's SAMEORIGIN framing blanked it.
  it("lets the verified shop's admin frame the app home", async () => {
    const res = await GET(adminLoad(sessionToken(CLIENT_SECRET)));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain(
      `frame-ancestors https://${SHOP} https://admin.shopify.com;`,
    );
    expect(loadShopifyAppHome).toHaveBeenCalledWith(SHOP, expect.any(String), expect.anything());
  });

  it('never loads a workspace for a token Shopify did not sign', async () => {
    const forged = sessionToken('not-the-client-secret');

    for (const request of [adminLoad(forged), adminLoad(forged, '&shopkeeper_reload=1')]) {
      const res = await GET(request);
      expect(res.status).toBe(200);
    }
    expect(loadShopifyAppHome).not.toHaveBeenCalled();
  });
});
