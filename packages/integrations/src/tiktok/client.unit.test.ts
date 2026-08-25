import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  exchangeTikTokShopOAuthCode,
  refreshTikTokShopAccessToken,
} from './client.js';
import type { TikTokShopOAuthCallbackConfig } from './types.js';

const oauthConfig: TikTokShopOAuthCallbackConfig = {
  appKey: 'app_key',
  appSecret: 'app_secret',
  appUrl: 'https://dashboard.test',
  authorizeUrl: 'https://tiktok.test/authorize',
  redirectUri: 'https://dashboard.test/api/integrations/tiktok-shop/callback',
  scopes: [],
  tokenMethod: 'POST',
  tokenUrl: 'https://tiktok.test/token',
};

const refreshConfig = {
  apiBaseUrl: 'https://open-api.tiktok.test',
  appKey: 'app-key',
  appSecret: 'app-secret',
  refreshTokenMethod: 'POST' as const,
  refreshTokenUrl: 'https://auth.tiktok.test/token',
  sendMessagePath: '/message/send',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('exchangeTikTokShopOAuthCode', () => {
  it.each([
    [400, { error: 'invalid authorization code' }, 'provider_rejected'],
    [429, { error: 'rate limit exceeded' }, 'rate_limited'],
    [503, { error: 'temporarily down' }, 'provider_unavailable'],
  ] as const)('classifies HTTP %s', async (status, body, category) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(body, status)));

    await expect(exchangeTikTokShopOAuthCode(oauthConfig, 'oauth_code')).rejects.toMatchObject({
      category,
      providerStatus: status,
    });
  });

  it('classifies token exchange timeouts as provider unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError')));

    await expect(exchangeTikTokShopOAuthCode(oauthConfig, 'oauth_code')).rejects.toMatchObject({
      category: 'provider_unavailable',
      name: 'TikTokShopProviderError',
    });
  });

  it.each([
    ['malformed JSON', new Response('not-json')],
    ['malformed success payload', jsonResponse({ data: { refresh_token: 'refresh' } })],
  ])('returns a typed provider response failure for %s', async (_label, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response));

    await expect(exchangeTikTokShopOAuthCode(oauthConfig, 'oauth_code')).rejects.toEqual(
      expect.objectContaining({
        category: 'malformed_response',
        name: 'TikTokShopProviderError',
      }),
    );
  });

  it('validates and normalizes a successful token response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({
      data: {
        access_token: 'access',
        expires_in: 3600,
        granted_scopes: 'buyer.message,order.read',
        open_id: 'open_1',
        refresh_token: 'refresh',
        seller_id: 42,
      },
    })));

    await expect(exchangeTikTokShopOAuthCode(oauthConfig, 'oauth_code')).resolves.toMatchObject({
      accessToken: 'access',
      openId: 'open_1',
      refreshToken: 'refresh',
      scopes: ['buyer.message', 'order.read'],
      sellerId: '42',
      tokenExpiresAt: expect.any(Date),
    });
  });
});

describe('refreshTikTokShopAccessToken', () => {
  it('applies a provider deadline', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { access_token: 'access-token' },
    })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshTikTokShopAccessToken(refreshConfig, 'refresh-token')).resolves.toMatchObject({
      accessToken: 'access-token',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.tiktok.test/token',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    );
  });

  it('classifies a token-refresh timeout as provider unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new DOMException('timed out', 'TimeoutError'),
    ));

    await expect(refreshTikTokShopAccessToken(refreshConfig, 'refresh-token')).rejects.toMatchObject({
      category: 'provider_unavailable',
      name: 'TikTokShopProviderError',
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
