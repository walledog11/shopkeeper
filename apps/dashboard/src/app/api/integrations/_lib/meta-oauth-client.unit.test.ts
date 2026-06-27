import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  exchangeLongLivedMetaToken,
  exchangeMetaOAuthCode,
  listMetaInstagramPages,
  subscribeMetaInstagramMessaging,
} from './meta-oauth-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Meta OAuth client', () => {
  it('returns structured token errors without trusting the provider payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { type: 'OAuthException', code: 190 },
    }), { status: 400 })));

    await expect(exchangeMetaOAuthCode({
      appId: 'app',
      appSecret: 'secret',
      code: 'code',
      redirectUri: 'https://dashboard.test/callback',
    })).resolves.toEqual({
      accessToken: null,
      error: { type: 'OAuthException', code: 190 },
      status: 400,
    });
  });

  it('rejects malformed pages while retaining valid page records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: 'missing-token', name: 'Invalid' },
        {
          id: 'page_1',
          name: 'Valid',
          access_token: 'page_token',
          instagram_business_account: { id: 'ig_1', username: 'shop' },
        },
      ],
    }))));

    await expect(listMetaInstagramPages('user_token')).resolves.toEqual([{
      id: 'page_1',
      name: 'Valid',
      accessToken: 'page_token',
      instagramBusinessAccount: { id: 'ig_1', username: 'shop' },
    }]);
  });

  it('handles invalid upgrade and subscription responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('not-json'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: 'yes' })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeLongLivedMetaToken({
      appId: 'app',
      appSecret: 'secret',
      shortLivedToken: 'short',
    })).resolves.toBeNull();
    await expect(subscribeMetaInstagramMessaging({
      pageId: 'page_1',
      pageToken: 'page_token',
    })).resolves.toEqual({ status: 200, success: false });
  });
});
