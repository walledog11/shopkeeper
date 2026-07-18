import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const dbMocks = vi.hoisted(() => ({
  integrationUpdate: vi.fn(),
}));

vi.mock('@shopkeeper/db', () => ({
  db: {
    integration: {
      update: dbMocks.integrationUpdate,
    },
  },
}));

import {
  getEmailOAuthClient,
  persistRefreshedToken,
  requestTokenRefresh,
} from './token';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  dbMocks.integrationUpdate.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('getEmailOAuthClient', () => {
  it('returns the configured Gmail OAuth client', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'google-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'google-secret');

    expect(getEmailOAuthClient()).toEqual({
      clientId: 'google-id',
      clientSecret: 'google-secret',
    });
  });

  it('returns null when provider credentials are incomplete', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'google-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');

    expect(getEmailOAuthClient()).toBeNull();
  });
});

describe('requestTokenRefresh', () => {
  it('posts refresh-token grants to the Gmail endpoint', async () => {
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({
        access_token: 'access-token',
        expires_in: 120,
        refresh_token: 'next-refresh-token',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    const result = await requestTokenRefresh('gmail', 'refresh-token', {
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.token.accessToken).toBe('access-token');
    expect(result.token.refreshToken).toBe('next-refresh-token');
    expect(result.token.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://oauth2.googleapis.com/token');
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    const params = new URLSearchParams(init.body as string);
    expect(params.get('client_id')).toBe('client-id');
    expect(params.get('client_secret')).toBe('client-secret');
    expect(params.get('refresh_token')).toBe('refresh-token');
    expect(params.get('grant_type')).toBe('refresh_token');
  });

  it('marks fetch failures as transient refresh failures', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    await expect(requestTokenRefresh('gmail', 'refresh-token', {
      clientId: 'client-id',
      clientSecret: 'client-secret',
    })).resolves.toEqual({ ok: false, status: null, transient: true });
  });

  it('bounds the refresh with a deadline and marks a timeout as transient', async () => {
    // Honor the abort signal as real fetch does; the tiny timeout fires it.
    mockFetch.mockImplementation((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      }),
    );

    await expect(requestTokenRefresh('gmail', 'refresh-token', {
      clientId: 'client-id',
      clientSecret: 'client-secret',
    }, 10)).resolves.toEqual({ ok: false, status: null, transient: true });
  });

  it('marks provider 4xx responses as non-transient refresh failures', async () => {
    mockFetch.mockResolvedValueOnce(new Response('invalid_grant', { status: 400 }));

    await expect(requestTokenRefresh('gmail', 'refresh-token', {
      clientId: 'client-id',
      clientSecret: 'client-secret',
    })).resolves.toEqual({
      ok: false,
      status: 400,
      transient: false,
      body: 'invalid_grant',
    });
  });
});

describe('persistRefreshedToken', () => {
  it('persists access-token refresh results', async () => {
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');

    await persistRefreshedToken('integration-id', {
      accessToken: 'access-token',
      expiresAt,
      refreshToken: 'next-refresh-token',
    });

    expect(dbMocks.integrationUpdate).toHaveBeenCalledWith({
      where: { id: 'integration-id' },
      data: {
        accessToken: 'access-token',
        tokenExpiresAt: expiresAt,
        refreshToken: 'next-refresh-token',
      },
    });
  });
});
