import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '@shopkeeper/agent/testing';
import {
  buildInstagramAuthorizationUrl,
  exchangeInstagramAuthorizationCode,
  exchangeInstagramLongLivedToken,
  fetchConnectedInstagramAccount,
  fetchInstagramAccount,
  fetchInstagramMessageSubscription,
  fetchInstagramMessagingUserProfile,
  INSTAGRAM_GRAPH_VERSION,
  INSTAGRAM_REQUIRED_SCOPES,
  refreshInstagramAccessToken,
  sendInstagramTextMessage,
  subscribeInstagramMessages,
  unsubscribeInstagramMessages,
} from './client.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Instagram API client', () => {
  it('builds the direct Instagram authorization URL with only the required scopes', () => {
    const url = new URL(buildInstagramAuthorizationUrl({
      appId: 'instagram-app-id',
      redirectUri: 'https://dashboard.test/api/integrations/instagram/callback',
      state: 'signed-state',
      forceReauth: true,
    }));

    expect(url.origin).toBe('https://www.instagram.com');
    expect(url.pathname).toBe('/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('instagram-app-id');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe(INSTAGRAM_REQUIRED_SCOPES.join(','));
    expect(url.searchParams.get('state')).toBe('signed-state');
    expect(url.searchParams.get('enable_fb_login')).toBe('false');
    expect(url.searchParams.get('force_reauth')).toBe('true');
    expect(url.searchParams.has('config_id')).toBe(false);
  });

  it('exchanges an authorization code with a form-encoded body and validates the token response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      data: [{
        access_token: 'short-token',
        user_id: 'app-scoped-user-id',
        permissions: 'instagram_business_basic,instagram_business_manage_messages',
      }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeInstagramAuthorizationCode({
      appId: 'instagram-app-id',
      appSecret: 'instagram-app-secret',
      code: 'one-time-code',
      redirectUri: 'https://dashboard.test/api/integrations/instagram/callback',
    })).resolves.toMatchObject({
      ok: true,
      data: {
        accessToken: 'short-token',
        userId: 'app-scoped-user-id',
        permissions: [...INSTAGRAM_REQUIRED_SCOPES],
      },
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toBe('https://api.instagram.com/oauth/access_token');
    expect(requestUrl).not.toContain('one-time-code');
    expect(requestUrl).not.toContain('instagram-app-secret');
    expect(requestInit.method).toBe('POST');
    expect(requestInit.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(requestInit.signal).toBeInstanceOf(AbortSignal);
    const form = new URLSearchParams(String(requestInit.body));
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('client_secret')).toBe('instagram-app-secret');
    expect(form.get('code')).toBe('one-time-code');
  });

  it('accepts a token response whose user ID is encoded as a JSON number', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({
      access_token: 'short-token',
      permissions: ['instagram_business_basic', 'instagram_business_manage_messages'],
      user_id: 17_841_400_000_000_000,
    })));

    await expect(exchangeInstagramAuthorizationCode({
      appId: 'instagram-app-id',
      appSecret: 'instagram-app-secret',
      code: 'one-time-code',
      redirectUri: 'https://dashboard.test/api/integrations/instagram/callback',
    })).resolves.toMatchObject({
      ok: true,
      data: {
        accessToken: 'short-token',
        userId: null,
        permissions: [...INSTAGRAM_REQUIRED_SCOPES],
      },
    });
  });

  it('rejects malformed success payloads and classifies structured provider errors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ user_id: 'missing-token' }] }))
      .mockResolvedValueOnce(jsonResponse({
        error: {
          code: 10,
          error_subcode: 2018278,
          fbtrace_id: 'trace-1',
          message: 'Outside messaging window',
        },
      }, 403));
    vi.stubGlobal('fetch', fetchMock);

    const malformed = await exchangeInstagramAuthorizationCode({
      appId: 'app',
      appSecret: 'secret',
      code: 'code',
      redirectUri: 'https://dashboard.test/callback',
    });
    expect(malformed).toEqual({
      ok: false,
      error: {
        category: 'validation',
        httpStatus: 200,
        code: null,
        subcode: null,
        message: 'Instagram API returned an invalid response',
        requestId: null,
      },
    });

    const failedSend = await sendInstagramTextMessage({
      accountId: 'ig-1',
      accessToken: 'token',
      recipientIgsid: 'igsid-1',
      text: 'Hello',
    });
    expect(failedSend).toEqual({
      ok: false,
      error: {
        category: 'permission',
        httpStatus: 403,
        code: 10,
        subcode: 2018278,
        message: 'Outside messaging window',
        requestId: 'trace-1',
      },
    });
  });

  it.each([
    [400, { error: { code: 190, message: 'Invalid authorization code' } }, 'authentication'],
    [429, { error: { code: 4, message: 'Rate limited' } }, 'rate_limit'],
    [503, { error: { code: 2, message: 'Provider unavailable' } }, 'transient_provider_failure'],
  ] as const)('classifies OAuth token HTTP %s', async (status, body, category) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(body, status)));

    await expect(exchangeInstagramAuthorizationCode({
      appId: 'app',
      appSecret: 'secret',
      code: 'code',
      redirectUri: 'https://dashboard.test/callback',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ category, httpStatus: status }),
    });
  });

  it.each([
    ['a timeout', () => Promise.reject(new DOMException('timed out', 'TimeoutError')), 'transient_provider_failure'],
    ['malformed JSON', () => Promise.resolve(new Response('not-json')), 'validation'],
  ])('returns a typed OAuth failure for %s', async (_label, fetchResult, category) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(fetchResult));

    await expect(exchangeInstagramAuthorizationCode({
      appId: 'app',
      appSecret: 'secret',
      code: 'code',
      redirectUri: 'https://dashboard.test/callback',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ category }),
    });
  });

  it('uses the centralized Graph version and bearer auth for account and subscription calls', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'long-token',
        token_type: 'bearer',
        expires_in: 5_183_944,
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{ user_id: 'ig-1', username: 'shop', account_type: 'Business' }],
      }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{ subscribed_fields: ['messages'] }],
      }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeInstagramLongLivedToken({
      appSecret: 'instagram-secret',
      shortLivedToken: 'short-token',
    })).resolves.toMatchObject({
      ok: true,
      data: { accessToken: 'long-token', expiresIn: 5_183_944, tokenType: 'bearer' },
    });
    await expect(fetchInstagramAccount('long-token')).resolves.toMatchObject({
      ok: true,
      data: { userId: 'ig-1', username: 'shop', accountType: 'Business' },
    });
    await expect(subscribeInstagramMessages({
      accountId: 'ig-1',
      accessToken: 'long-token',
    })).resolves.toMatchObject({ ok: true, data: { success: true } });
    await expect(fetchInstagramMessageSubscription({
      accountId: 'ig-1',
      accessToken: 'long-token',
    })).resolves.toMatchObject({
      ok: true,
      data: { fields: ['messages'], messagesActive: true },
    });
    await expect(unsubscribeInstagramMessages({
      accountId: 'ig-1',
      accessToken: 'long-token',
    })).resolves.toMatchObject({ ok: true, data: { success: true } });

    const versionedCalls = fetchMock.mock.calls.slice(1);
    expect(versionedCalls).toHaveLength(4);
    for (const [requestUrl, requestInit] of versionedCalls) {
      const url = new URL(String(requestUrl));
      expect(url.origin).toBe('https://graph.instagram.com');
      expect(url.pathname.startsWith(`/${INSTAGRAM_GRAPH_VERSION}/`)).toBe(true);
      expect((requestInit as RequestInit).headers).toMatchObject({
        Authorization: 'Bearer long-token',
      });
      expect(url.searchParams.has('access_token')).toBe(false);
    }
  });

  it('sends text through the versioned Instagram endpoint and returns the provider message ID', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      recipient_id: 'igsid-1',
      message_id: 'mid-1',
    }, { headers: { 'x-fb-trace-id': 'trace-2' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendInstagramTextMessage({
      accountId: 'ig-1',
      accessToken: 'long-token',
      recipientIgsid: 'igsid-1',
      text: 'Hello from Shopkeeper',
    })).resolves.toEqual({
      ok: true,
      data: { messageId: 'mid-1', recipientId: 'igsid-1' },
      httpStatus: 200,
      requestId: 'trace-2',
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(requestUrl).pathname).toBe(`/${INSTAGRAM_GRAPH_VERSION}/ig-1/messages`);
    expect(requestInit.headers).toEqual({
      Authorization: 'Bearer long-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(requestInit.body))).toEqual({
      recipient: { id: 'igsid-1' },
      message: { text: 'Hello from Shopkeeper' },
    });
  });

  it('enforces Instagram text byte limits before making a provider request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendInstagramTextMessage({
      accountId: 'ig-1',
      accessToken: 'long-token',
      recipientIgsid: 'igsid-1',
      text: '🙂'.repeat(251),
    })).resolves.toMatchObject({
      ok: false,
      error: { category: 'validation', message: 'Instagram text messages must be 1000 bytes or less' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the centralized Graph version and bearer auth for gateway account and profile reads', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: [{ user_id: 'ig-1', username: 'shop', account_type: 'Business' }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        name: 'Jane Doe',
        username: 'jane',
        profile_pic: 'https://cdn.example/profile.jpg',
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: [{ subscribed_fields: ['messages', 'comments'] }],
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchConnectedInstagramAccount('long-token')).resolves.toMatchObject({
      ok: true,
      data: { userId: 'ig-1', username: 'shop', accountType: 'Business' },
    });
    await expect(fetchInstagramMessagingUserProfile('igsid-1', 'long-token')).resolves.toMatchObject({
      ok: true,
      data: {
        name: 'Jane Doe',
        username: 'jane',
        profilePictureUrl: 'https://cdn.example/profile.jpg',
      },
    });
    await expect(fetchInstagramMessageSubscription({
      accountId: 'ig-1',
      accessToken: 'long-token',
    })).resolves.toMatchObject({
      ok: true,
      data: { fields: ['messages', 'comments'], messagesActive: true },
    });

    for (const [requestUrl, requestInit] of fetchMock.mock.calls) {
      const url = new URL(String(requestUrl));
      expect(url.origin).toBe('https://graph.instagram.com');
      expect(url.pathname.startsWith(`/${INSTAGRAM_GRAPH_VERSION}/`)).toBe(true);
      expect(url.searchParams.has('access_token')).toBe(false);
      expect((requestInit as RequestInit).headers).toEqual({
        Authorization: 'Bearer long-token',
      });
      expect((requestInit as RequestInit).signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('refreshes a long-lived Instagram token and validates the expiry', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      access_token: 'refreshed-token',
      token_type: 'bearer',
      expires_in: 5_183_944,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshInstagramAccessToken('long-token')).resolves.toMatchObject({
      ok: true,
      data: {
        accessToken: 'refreshed-token',
        expiresIn: 5_183_944,
        tokenType: 'bearer',
      },
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin).toBe('https://graph.instagram.com');
    expect(url.pathname).toBe('/refresh_access_token');
    expect(url.searchParams.get('grant_type')).toBe('ig_refresh_token');
    expect(url.searchParams.get('access_token')).toBe('long-token');
  });

  it('returns classified provider errors with Meta diagnostics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({
      error: {
        message: 'Invalid OAuth access token.',
        code: 190,
        error_subcode: 463,
        fbtrace_id: 'trace-1',
      },
    }, 400)));

    await expect(fetchConnectedInstagramAccount('expired-token')).resolves.toEqual({
      ok: false,
      error: {
        category: 'authentication',
        httpStatus: 400,
        code: 190,
        subcode: 463,
        message: 'Invalid OAuth access token.',
        requestId: 'trace-1',
      },
    });
  });

  it('rejects malformed success responses instead of inferring success from HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({
      access_token: 'missing-expiry',
    }, { headers: { 'x-request-id': 'request-1' } })));

    await expect(refreshInstagramAccessToken('long-token')).resolves.toEqual({
      ok: false,
      error: {
        category: 'validation',
        httpStatus: 200,
        code: null,
        subcode: null,
        message: 'Instagram API returned an invalid response',
        requestId: 'request-1',
      },
    });
  });
});
