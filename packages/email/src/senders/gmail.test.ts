import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRawMime } from '../mime-build';

const tokenMocks = vi.hoisted(() => ({
  getEmailOAuthClient: vi.fn(),
  persistRefreshedToken: vi.fn(),
  requestTokenRefresh: vi.fn(),
}));

vi.mock('../token.js', () => tokenMocks);

const dbMocks = vi.hoisted(() => ({
  markIntegrationReauthorizationRequired: vi.fn(),
}));

vi.mock('@shopkeeper/db', () => dbMocks);

import { GmailSender } from './gmail';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  tokenMocks.getEmailOAuthClient.mockReset();
  tokenMocks.persistRefreshedToken.mockReset();
  tokenMocks.requestTokenRefresh.mockReset();
  dbMocks.markIntegrationReauthorizationRequired.mockReset();
  dbMocks.markIntegrationReauthorizationRequired.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', mockFetch);
  tokenMocks.getEmailOAuthClient.mockReturnValue({
    clientId: 'google-client-id',
    clientSecret: 'google-client-secret',
  });
  tokenMocks.persistRefreshedToken.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildRawMime', () => {
  it('builds an RFC 5322 message with headers, body, and base64url encoding', () => {
    const raw = buildRawMime({
      to: 'customer@example.test',
      fromAddress: 'support@merchant.test',
      fromName: 'Merchant Support',
      replyTo: 'support@merchant.test',
      subject: 'Re: Your order',
      text: 'Hi there!',
      headers: [
        { name: 'Message-ID', value: '<thread-1@mail.test>' },
        { name: 'In-Reply-To', value: '<incoming@example.test>' },
        { name: 'References', value: '<incoming@example.test>' },
      ],
    });

    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    expect(decoded).toContain('From: Merchant Support <support@merchant.test>');
    expect(decoded).toContain('To: customer@example.test');
    expect(decoded).not.toMatch(/(^|\r\n)Reply-To:/);
    expect(decoded).toContain('Subject: Re: Your order');
    expect(decoded).toContain('Message-ID: <thread-1@mail.test>');
    expect(decoded).toContain('In-Reply-To: <incoming@example.test>');
    expect(decoded).toContain('References: <incoming@example.test>');
    expect(decoded).toContain('MIME-Version: 1.0');
    expect(decoded).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(decoded).toMatch(/\r\n\r\nHi there!$/);
    expect(raw).not.toMatch(/[+/=]/);
  });

  it('encodes non-ASCII subjects as RFC 2047 encoded-words', () => {
    const raw = buildRawMime({
      to: 'a@b.test',
      fromAddress: 'c@d.test',
      fromName: 'Sender',
      subject: 'Café ☕',
      text: 'hi',
    });
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    expect(decoded).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
  });
});

describe('GmailSender.send', () => {
  it('flags the integration for reconnection when the refresh is refused', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    tokenMocks.requestTokenRefresh.mockResolvedValueOnce({
      ok: false,
      status: 400,
      transient: false,
      body: '{"error":"invalid_grant"}',
    });

    const sender = new GmailSender({
      id: 'gmail-integration',
      accessToken: 'old_token',
      refreshToken: 'dead_refresh_token',
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    });

    await expect(sender.send({
      to: 'customer@example.test',
      fromAddress: 'merchant@gmail.test',
      fromName: 'Merchant',
      subject: 'Hi',
      text: 'Hello',
    })).rejects.toThrow('Gmail token refresh failed: 400');

    // Without this the send is the only thing that knows, and the integration
    // card keeps reporting a healthy connection until the daily probe runs.
    expect(dbMocks.markIntegrationReauthorizationRequired)
      .toHaveBeenCalledWith('gmail-integration');
  });

  it('leaves the integration alone when the refresh fails transiently', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    tokenMocks.requestTokenRefresh.mockResolvedValueOnce({
      ok: false,
      status: 503,
      transient: true,
    });

    const sender = new GmailSender({
      id: 'gmail-integration',
      accessToken: 'old_token',
      refreshToken: 'refresh_token',
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    });

    await expect(sender.send({
      to: 'customer@example.test',
      fromAddress: 'merchant@gmail.test',
      fromName: 'Merchant',
      subject: 'Hi',
      text: 'Hello',
    })).rejects.toThrow('Gmail token refresh failed: 503');

    // Google having a bad minute must not tell the merchant to reconnect.
    expect(dbMocks.markIntegrationReauthorizationRequired).not.toHaveBeenCalled();
  });

  it('refreshes on 401, retries once, and persists the new token', async () => {
    const refreshedToken = {
      accessToken: 'new_token',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    };

    mockFetch
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'msg_1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    tokenMocks.requestTokenRefresh.mockResolvedValueOnce({ ok: true, token: refreshedToken });

    const sender = new GmailSender({
      id: 'gmail-integration',
      accessToken: 'old_token',
      refreshToken: 'refresh_token',
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    });

    const result = await sender.send({
      to: 'customer@example.test',
      fromAddress: 'merchant@gmail.test',
      fromName: 'Merchant',
      subject: 'Hi',
      text: 'Hello',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ providerMessageId: 'msg_1' });
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(String(mockFetch.mock.calls[1][0])).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(tokenMocks.requestTokenRefresh).toHaveBeenCalledWith('gmail', 'refresh_token', {
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
    });
    expect(tokenMocks.persistRefreshedToken).toHaveBeenCalledWith('gmail-integration', refreshedToken);

    const sendInit = mockFetch.mock.calls[1][1] as RequestInit;
    expect((sendInit.headers as Record<string, string>).Authorization).toBe('Bearer new_token');
  });

  it('proactively refreshes when the token is near expiry', async () => {
    const refreshedToken = {
      accessToken: 'fresh',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    };

    tokenMocks.requestTokenRefresh.mockResolvedValueOnce({ ok: true, token: refreshedToken });
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'msg' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const sender = new GmailSender({
      id: 'gmail-integration',
      accessToken: 'stale',
      refreshToken: 'refresh_token',
      tokenExpiresAt: new Date(Date.now() - 1000),
    });

    const result = await sender.send({
      to: 'c@x.test',
      fromAddress: 'merchant@gmail.test',
      fromName: 'M',
      subject: 'Hi',
      text: 'Hi',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ providerMessageId: 'msg' });
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(tokenMocks.persistRefreshedToken).toHaveBeenCalledWith('gmail-integration', refreshedToken);
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fresh');
  });

  it('treats a successful response without a provider message id as ambiguous', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const sender = new GmailSender({
      id: 'gmail-integration',
      accessToken: 'token',
      refreshToken: 'refresh_token',
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    });

    await expect(sender.send({
      to: 'c@x.test',
      fromAddress: 'merchant@gmail.test',
      fromName: 'M',
      subject: 'Hi',
      text: 'Hi',
    })).rejects.toThrow('Gmail accepted the send but returned no message id');
  });

  it('bounds sends and classifies a deadline as an ambiguous provider outcome', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
    const sender = new GmailSender({
      id: 'gmail-integration',
      accessToken: 'token',
      refreshToken: 'refresh_token',
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    });

    await expect(sender.send({
      to: 'c@x.test',
      fromAddress: 'merchant@gmail.test',
      fromName: 'M',
      subject: 'Hi',
      text: 'Hi',
    })).rejects.toMatchObject({
      name: 'EmailProviderRequestTimeoutError',
      operation: 'message send',
      provider: 'gmail',
    });
    expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({
      signal: expect.any(AbortSignal),
    });
  });
});
