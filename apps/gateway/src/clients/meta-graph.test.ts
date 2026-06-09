import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkInstagramAccountAccess,
  exchangeFacebookLongLivedToken,
  fetchInstagramUserProfile,
  META_GRAPH_VERSION,
} from './meta-graph.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('meta-graph client', () => {
  it('checks Instagram account access with encoded query params', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 'page_123' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkInstagramAccountAccess('page_123', 'token/with+special')).resolves.toEqual({
      data: { id: 'page_123' },
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin).toBe('https://graph.facebook.com');
    expect(url.pathname).toBe(`/${META_GRAPH_VERSION}/page_123`);
    expect(url.searchParams.get('fields')).toBe('id');
    expect(url.searchParams.get('access_token')).toBe('token/with+special');
  });

  it('returns Graph API errors without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({
      error: { message: 'Invalid OAuth access token.' },
    })));

    await expect(checkInstagramAccountAccess('page_123', 'bad-token')).resolves.toEqual({
      error: { message: 'Invalid OAuth access token.' },
    });
  });

  it('fetches an Instagram user profile with encoded query params', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      name: 'Jane Doe',
      profile_pic: 'https://example.com/pic.jpg',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchInstagramUserProfile('sender_456', 'token/with+special')).resolves.toEqual({
      data: { name: 'Jane Doe', profile_pic: 'https://example.com/pic.jpg' },
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe(`/${META_GRAPH_VERSION}/sender_456`);
    expect(url.searchParams.get('fields')).toBe('name,profile_pic');
    expect(url.searchParams.get('access_token')).toBe('token/with+special');
  });

  it('exchanges a long-lived Facebook token', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ access_token: 'long-lived-token' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeFacebookLongLivedToken('app-id', 'app-secret', 'short-token')).resolves.toEqual({
      data: { access_token: 'long-lived-token' },
    });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe(`/${META_GRAPH_VERSION}/oauth/access_token`);
    expect(url.searchParams.get('grant_type')).toBe('fb_exchange_token');
    expect(url.searchParams.get('client_id')).toBe('app-id');
    expect(url.searchParams.get('client_secret')).toBe('app-secret');
    expect(url.searchParams.get('fb_exchange_token')).toBe('short-token');
  });
});
