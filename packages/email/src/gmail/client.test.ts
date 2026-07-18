import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeGmailBase64Url } from './base64url';
import { GmailApiClient } from './client';
import { GmailApiError } from './errors';

const integration = {
  id: 'integration-1',
  accessToken: 'old-access-token',
  refreshToken: 'refresh-token',
  tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
};

const mockFetch = vi.fn();
const persistToken = vi.fn();
const refreshToken = vi.fn();

function createClient() {
  return new GmailApiClient(integration, {
    fetch: mockFetch,
    oauthClient: {
      clientId: 'client-id',
      clientSecret: 'client-secret',
    },
    persistToken,
    refreshToken,
    now: () => Date.parse('2029-01-01T00:00:00.000Z'),
  });
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  persistToken.mockReset();
  refreshToken.mockReset();
  persistToken.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GmailApiClient authentication', () => {
  it('refreshes and persists once after a 401, then retries the request', async () => {
    const refreshed = {
      accessToken: 'fresh-access-token',
      expiresAt: new Date('2031-01-01T00:00:00.000Z'),
    };
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({
        historyId: '123',
        expiration: '1924992000000',
      }));
    refreshToken.mockResolvedValueOnce({ ok: true, token: refreshed });

    await expect(createClient().watch({
      topicName: 'projects/project/topics/gmail',
      labelIds: ['INBOX'],
      labelFilterBehavior: 'include',
    })).resolves.toEqual({
      historyId: '123',
      expiration: '1924992000000',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(refreshToken).toHaveBeenCalledWith('refresh-token', {
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });
    expect(persistToken).toHaveBeenCalledWith('integration-1', refreshed);
    const retryInit = mockFetch.mock.calls[1][1] as RequestInit;
    expect(retryInit.headers).toMatchObject({
      Authorization: 'Bearer fresh-access-token',
    });
  });

  it('classifies a second 401 as an authentication failure without another retry', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({}, 401));
    refreshToken.mockResolvedValueOnce({
      ok: true,
      token: {
        accessToken: 'fresh-access-token',
        expiresAt: new Date('2031-01-01T00:00:00.000Z'),
      },
    });

    await expect(createClient().stop()).rejects.toMatchObject({
      name: 'GmailApiError',
      kind: 'authentication',
      retryable: false,
      status: 401,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(refreshToken).toHaveBeenCalledTimes(1);
  });
});

describe('GmailApiClient resources', () => {
  it('paginates mailbox history and returns the final checkpoint', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({
        history: [{
          id: '101',
          messagesAdded: [{ message: { id: 'message-1', threadId: 'thread-1' } }],
        }],
        nextPageToken: 'next-page',
        historyId: '110',
      }))
      .mockResolvedValueOnce(jsonResponse({
        history: [{
          id: '111',
          messagesAdded: [{ message: { id: 'message-2', labelIds: ['INBOX'] } }],
        }],
        historyId: '120',
      }));

    await expect(createClient().listHistory({
      startHistoryId: '100',
      historyTypes: ['messageAdded'],
      labelId: 'INBOX',
      pageSize: 50,
    })).resolves.toEqual({
      history: [
        {
          id: '101',
          messagesAdded: [{ message: { id: 'message-1', threadId: 'thread-1' } }],
        },
        {
          id: '111',
          messagesAdded: [{ message: { id: 'message-2', labelIds: ['INBOX'] } }],
        },
      ],
      historyId: '120',
    });

    const firstUrl = new URL(String(mockFetch.mock.calls[0][0]));
    expect(firstUrl.pathname).toBe('/gmail/v1/users/me/history');
    expect(firstUrl.searchParams.get('startHistoryId')).toBe('100');
    expect(firstUrl.searchParams.getAll('historyTypes')).toEqual(['messageAdded']);
    expect(firstUrl.searchParams.get('maxResults')).toBe('50');
    expect(firstUrl.searchParams.get('labelId')).toBe('INBOX');

    const secondUrl = new URL(String(mockFetch.mock.calls[1][0]));
    expect(secondUrl.searchParams.get('pageToken')).toBe('next-page');
  });

  it('gets and decodes a raw message', async () => {
    const raw = Buffer.from('From: customer@example.test\r\n\r\nHello').toString('base64url');
    mockFetch.mockResolvedValueOnce(jsonResponse({
      id: 'message/id',
      threadId: 'thread-1',
      labelIds: ['INBOX'],
      historyId: '123',
      internalDate: '1700000000000',
      sizeEstimate: 42,
      raw,
    }));

    const message = await createClient().getMessageRaw('message/id');

    expect(message.raw.toString('utf8')).toBe('From: customer@example.test\r\n\r\nHello');
    expect(message.id).toBe('message/id');
    expect(String(mockFetch.mock.calls[0][0])).toContain(
      '/users/me/messages/message%2Fid?format=raw',
    );
  });

  it('lists only an explicitly bounded recovery page', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      messages: [{ id: 'message-1', threadId: 'thread-1' }],
      nextPageToken: 'next-page',
      resultSizeEstimate: 800,
    }));

    await expect(createClient().listMessages({
      maxResults: 100,
      query: 'newer_than:7d',
      labelIds: ['INBOX'],
      includeSpamTrash: false,
    })).resolves.toEqual({
      messages: [{ id: 'message-1', threadId: 'thread-1' }],
      nextPageToken: 'next-page',
      resultSizeEstimate: 800,
    });

    const url = new URL(String(mockFetch.mock.calls[0][0]));
    expect(url.searchParams.get('maxResults')).toBe('100');
    expect(url.searchParams.get('q')).toBe('newer_than:7d');
    expect(url.searchParams.getAll('labelIds')).toEqual(['INBOX']);
    expect(url.searchParams.get('includeSpamTrash')).toBe('false');

    await expect(createClient().listMessages({ maxResults: 501 }))
      .rejects.toThrow('maxResults must be an integer between 1 and 500');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('GmailApiClient response validation and errors', () => {
  it('rejects malformed typed responses', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      historyId: 123,
      expiration: '1924992000000',
    }));

    await expect(createClient().watch({
      topicName: 'projects/project/topics/gmail',
    })).rejects.toMatchObject({
      name: 'GmailApiError',
      kind: 'invalid_response',
      operation: 'users.watch',
    });
  });

  it('classifies a history 404 as a stale checkpoint', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: { message: 'not found' } }, 404));

    await expect(createClient().listHistory({
      startHistoryId: 'expired-history-id',
    })).rejects.toMatchObject({
      name: 'GmailApiError',
      kind: 'stale_history',
      retryable: false,
      status: 404,
    });
  });

  it('classifies 429 and quota-flavored 403 responses as retryable quota failures', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 429, { 'Retry-After': '10' }));

    await expect(createClient().stop()).rejects.toMatchObject({
      kind: 'quota',
      retryable: true,
      retryAfterMs: 10_000,
      status: 429,
    });

    mockFetch.mockResolvedValueOnce(jsonResponse({
      error: { errors: [{ reason: 'userRateLimitExceeded' }] },
    }, 403));
    await expect(createClient().stop()).rejects.toMatchObject({
      kind: 'quota',
      retryable: true,
      status: 403,
    });
  });

  it.each([500, 503])('classifies HTTP %s as retryable', async (status) => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, status));

    await expect(createClient().stop()).rejects.toMatchObject({
      kind: 'retryable',
      retryable: true,
      status,
    });
  });

  it('classifies a request deadline as a typed timeout error', async () => {
    const client = new GmailApiClient(integration, {
      fetch: mockFetch,
      oauthClient: { clientId: 'client-id', clientSecret: 'client-secret' },
      persistToken,
      refreshToken,
      now: () => Date.parse('2029-01-01T00:00:00.000Z'),
      requestTimeoutMs: 10,
    });
    // Honor the abort signal exactly as real fetch does, rejecting with the
    // signal's reason (AbortSignal.timeout's own TimeoutError DOMException).
    mockFetch.mockImplementation((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      }),
    );

    await expect(client.getMessageRaw('message-1')).rejects.toMatchObject({
      name: 'GmailApiError',
      kind: 'timeout',
      retryable: false,
      operation: 'users.messages.get',
    });
  });

  it('classifies a non-timeout fetch failure as retryable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('socket hang up'));

    await expect(createClient().getMessageRaw('message-1')).rejects.toMatchObject({
      name: 'GmailApiError',
      kind: 'retryable',
      retryable: true,
    });
  });
});

describe('decodeGmailBase64Url', () => {
  it('decodes padded and unpadded Gmail data', () => {
    expect(decodeGmailBase64Url('SGVsbG8td29ybGQ').toString()).toBe('Hello-world');
    expect(decodeGmailBase64Url('SGVsbG8=')).toEqual(Buffer.from('Hello'));
  });

  it('rejects malformed base64url data', () => {
    expect(() => decodeGmailBase64Url('%%%')).toThrow(GmailApiError);
    expect(() => decodeGmailBase64Url('a')).toThrow(GmailApiError);
    expect(() => decodeGmailBase64Url('ab=')).toThrow(GmailApiError);
  });
});
