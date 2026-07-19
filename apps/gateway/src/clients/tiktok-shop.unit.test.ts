import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshTikTokShopAccessToken } from './tiktok-shop.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const config = {
  apiBaseUrl: 'https://open-api.tiktok.test',
  appKey: 'app-key',
  appSecret: 'app-secret',
  enabled: true,
  refreshTokenMethod: 'POST' as const,
  refreshTokenUrl: 'https://auth.tiktok.test/token',
};

describe('refreshTikTokShopAccessToken', () => {
  it('applies a provider deadline', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { access_token: 'access-token' },
    })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshTikTokShopAccessToken(config, 'refresh-token')).resolves.toMatchObject({
      accessToken: 'access-token',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.tiktok.test/token',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    );
  });

  it('classifies a token-refresh deadline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new DOMException('timed out', 'TimeoutError'),
    ));

    await expect(refreshTikTokShopAccessToken(config, 'refresh-token')).rejects.toMatchObject({
      name: 'ExternalRequestTimeoutError',
      operation: 'token refresh',
      provider: 'tiktok_shop',
    });
  });
});
