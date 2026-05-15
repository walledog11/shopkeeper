import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@clerk/db';
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers';
import { OutlookSender } from './outlook';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

let org: Awaited<ReturnType<typeof createTestOrg>> | null;

beforeEach(async () => {
  org = await createTestOrg();
  vi.stubEnv('MICROSOFT_CLIENT_ID', 'ms-client-id');
  vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'ms-client-secret');
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('OutlookSender.send', () => {
  it('posts base64 MIME to Graph me/sendMail with the access token', async () => {
    const integration = await db.integration.create({
      data: {
        organizationId: org!.id,
        platform: ChannelType.email,
        externalAccountId: 'merchant@outlook.test',
        accessToken: 'token',
        refreshToken: 'refresh',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        metadata: { provider: 'outlook' },
      },
    });

    mockFetch.mockResolvedValueOnce(new Response('', { status: 202 }));

    const sender = new OutlookSender({
      id: integration.id,
      accessToken: integration.accessToken,
      refreshToken: integration.refreshToken,
      tokenExpiresAt: integration.tokenExpiresAt,
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
  });

  it('refreshes on 401, retries once, and persists the new token', async () => {
    const integration = await db.integration.create({
      data: {
        organizationId: org!.id,
        platform: ChannelType.email,
        externalAccountId: 'merchant@outlook.test',
        accessToken: 'old_token',
        refreshToken: 'refresh_token',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        metadata: { provider: 'outlook' },
      },
    });

    mockFetch
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'new_token', expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('', { status: 202 }));

    const sender = new OutlookSender({
      id: integration.id,
      accessToken: integration.accessToken,
      refreshToken: integration.refreshToken,
      tokenExpiresAt: integration.tokenExpiresAt,
    });

    await sender.send({
      to: 'customer@example.test',
      fromAddress: 'merchant@outlook.test',
      fromName: 'Merchant',
      subject: 'Hi',
      text: 'Hello',
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    expect(String(mockFetch.mock.calls[1][0])).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token');
    expect(String(mockFetch.mock.calls[2][0])).toBe('https://graph.microsoft.com/v1.0/me/sendMail');

    const sendInit = mockFetch.mock.calls[2][1] as RequestInit;
    expect((sendInit.headers as Record<string, string>).Authorization).toBe('Bearer new_token');

    const updated = await db.integration.findUnique({ where: { id: integration.id } });
    expect(updated?.accessToken).toBe('new_token');
    expect(updated?.tokenExpiresAt?.getTime()).toBeGreaterThan(Date.now());
  });

  it('proactively refreshes when the token is near expiry', async () => {
    const integration = await db.integration.create({
      data: {
        organizationId: org!.id,
        platform: ChannelType.email,
        externalAccountId: 'merchant@outlook.test',
        accessToken: 'stale',
        refreshToken: 'refresh_token',
        tokenExpiresAt: new Date(Date.now() - 1000),
        metadata: { provider: 'outlook' },
      },
    });

    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'fresh', expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('', { status: 202 }));

    const sender = new OutlookSender({
      id: integration.id,
      accessToken: integration.accessToken,
      refreshToken: integration.refreshToken,
      tokenExpiresAt: integration.tokenExpiresAt,
    });

    await sender.send({
      to: 'c@x.test',
      fromAddress: 'merchant@outlook.test',
      fromName: 'M',
      subject: 'Hi',
      text: 'Hi',
    });

    expect(String(mockFetch.mock.calls[0][0])).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token');
    expect(String(mockFetch.mock.calls[1][0])).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    const init = mockFetch.mock.calls[1][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fresh');
  });
});
