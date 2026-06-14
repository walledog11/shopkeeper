import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tokenMocks = vi.hoisted(() => ({
  getEmailOAuthClient: vi.fn(),
  persistRefreshedToken: vi.fn(),
  requestTokenRefresh: vi.fn(),
}));

vi.mock('../token.js', () => tokenMocks);

import { OutlookSender } from './outlook';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  tokenMocks.getEmailOAuthClient.mockReset();
  tokenMocks.persistRefreshedToken.mockReset();
  tokenMocks.requestTokenRefresh.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  tokenMocks.getEmailOAuthClient.mockReturnValue({
    clientId: 'ms-client-id',
    clientSecret: 'ms-client-secret',
  });
  tokenMocks.persistRefreshedToken.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OutlookSender.send', () => {
  it('posts base64 MIME to Graph me/sendMail with the access token', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 202 }));

    const sender = new OutlookSender({
      id: 'outlook-integration',
      accessToken: 'token',
      refreshToken: 'refresh',
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    });

    await sender.send({
      to: 'customer@example.test',
      fromAddress: 'merchant@outlook.test',
      fromName: 'Merchant',
      subject: 'Re: Order',
      text: 'Hello',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain');

    const body = init.body as string;
    const decoded = Buffer.from(body, 'base64').toString('utf8');
    expect(decoded).toContain('From: Merchant <merchant@outlook.test>');
    expect(decoded).toContain('To: customer@example.test');
    expect(decoded).toContain('Subject: Re: Order');
    expect(decoded).toMatch(/\r\n\r\nHello$/);
    expect(tokenMocks.requestTokenRefresh).not.toHaveBeenCalled();
  });

  it('refreshes on 401, retries once, and persists the new token', async () => {
    const refreshedToken = {
      accessToken: 'new_token',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    };

    mockFetch
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 202 }));
    tokenMocks.requestTokenRefresh.mockResolvedValueOnce({ ok: true, token: refreshedToken });

    const sender = new OutlookSender({
      id: 'outlook-integration',
      accessToken: 'old_token',
      refreshToken: 'refresh_token',
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    });

    await sender.send({
      to: 'customer@example.test',
      fromAddress: 'merchant@outlook.test',
      fromName: 'Merchant',
      subject: 'Hi',
      text: 'Hello',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    expect(String(mockFetch.mock.calls[1][0])).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    expect(tokenMocks.requestTokenRefresh).toHaveBeenCalledWith('outlook', 'refresh_token', {
      clientId: 'ms-client-id',
      clientSecret: 'ms-client-secret',
    });
    expect(tokenMocks.persistRefreshedToken).toHaveBeenCalledWith('outlook-integration', refreshedToken);

    const sendInit = mockFetch.mock.calls[1][1] as RequestInit;
    expect((sendInit.headers as Record<string, string>).Authorization).toBe('Bearer new_token');
  });

  it('proactively refreshes when the token is near expiry', async () => {
    const refreshedToken = {
      accessToken: 'fresh',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    };

    tokenMocks.requestTokenRefresh.mockResolvedValueOnce({ ok: true, token: refreshedToken });
    mockFetch.mockResolvedValueOnce(new Response('', { status: 202 }));

    const sender = new OutlookSender({
      id: 'outlook-integration',
      accessToken: 'stale',
      refreshToken: 'refresh_token',
      tokenExpiresAt: new Date(Date.now() - 1000),
    });

    await sender.send({
      to: 'c@x.test',
      fromAddress: 'merchant@outlook.test',
      fromName: 'M',
      subject: 'Hi',
      text: 'Hi',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    expect(tokenMocks.persistRefreshedToken).toHaveBeenCalledWith('outlook-integration', refreshedToken);
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fresh');
  });
});
