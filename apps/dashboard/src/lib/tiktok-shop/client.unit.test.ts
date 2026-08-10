import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TikTokShopOAuthCallbackConfig } from './config';
import { exchangeTikTokShopOAuthCode } from './client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const config: TikTokShopOAuthCallbackConfig = {
  appKey: 'app_key',
  appSecret: 'app_secret',
  appUrl: 'https://dashboard.test',
  authorizeUrl: 'https://tiktok.test/authorize',
  redirectUri: 'https://dashboard.test/api/integrations/tiktok-shop/callback',
  scopes: [],
  tokenMethod: 'POST',
  tokenUrl: 'https://tiktok.test/token',
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('exchangeTikTokShopOAuthCode', () => {
  it.each([
    [400, { error: 'invalid authorization code' }, 'provider_rejected'],
    [429, { error: 'rate limit exceeded' }, 'rate_limited'],
    [503, { error: 'temporarily down' }, 'provider_unavailable'],
  ] as const)('classifies HTTP %s', async (status, body, category) => {
    mockFetch.mockResolvedValueOnce(jsonResponse(body, status));

    await expect(exchangeTikTokShopOAuthCode(config, 'oauth_code')).rejects.toMatchObject({
      category,
      providerStatus: status,
    });
  });

  it('classifies token exchange timeouts as provider unavailable', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));

    await expect(exchangeTikTokShopOAuthCode(config, 'oauth_code')).rejects.toMatchObject({
      category: 'provider_unavailable',
      name: 'TikTokShopProviderError',
    });
  });

  it.each([
    ['malformed JSON', new Response('not-json')],
    ['malformed success payload', jsonResponse({ data: { refresh_token: 'refresh' } })],
  ])('returns a typed provider response failure for %s', async (_label, response) => {
    mockFetch.mockResolvedValueOnce(response);

    await expect(exchangeTikTokShopOAuthCode(config, 'oauth_code')).rejects.toEqual(
      expect.objectContaining({
        category: 'malformed_response',
        name: 'TikTokShopProviderError',
      }),
    );
  });

  it('validates and normalizes a successful token response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: {
        access_token: 'access',
        expires_in: 3600,
        granted_scopes: 'buyer.message,order.read',
        open_id: 'open_1',
        refresh_token: 'refresh',
        seller_id: 42,
      },
    }));

    await expect(exchangeTikTokShopOAuthCode(config, 'oauth_code')).resolves.toMatchObject({
      accessToken: 'access',
      openId: 'open_1',
      refreshToken: 'refresh',
      scopes: ['buyer.message', 'order.read'],
      sellerId: '42',
      tokenExpiresAt: expect.any(Date),
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
