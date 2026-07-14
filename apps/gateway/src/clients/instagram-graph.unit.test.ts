import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchConnectedInstagramAccount,
  fetchInstagramMessagingUserProfile,
  INSTAGRAM_GRAPH_VERSION,
  refreshInstagramAccessToken,
} from './instagram-graph.js';

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Instagram gateway Graph client', () => {
  it('uses the centralized Graph version and bearer auth for account and profile reads', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: [{ user_id: 'ig-1', username: 'shop', account_type: 'Business' }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        name: 'Jane Doe',
        username: 'jane',
        profile_pic: 'https://cdn.example/profile.jpg',
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
    }, 200, { 'x-request-id': 'request-1' })));

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
