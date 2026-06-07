import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';
import { GmailSender, buildRawMime } from './gmail';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

let org: Awaited<ReturnType<typeof createTestOrg>> | null;

beforeEach(async () => {
  org = await createTestOrg();
  vi.stubEnv('GOOGLE_CLIENT_ID', 'google-client-id');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'google-client-secret');
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
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
  it('refreshes on 401, retries once, and persists the new token', async () => {
    const integration = await db.integration.create({
      data: {
        organizationId: org!.id,
        platform: ChannelType.email,
        externalAccountId: 'merchant@gmail.test',
        accessToken: 'old_token',
        refreshToken: 'refresh_token',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        metadata: { provider: 'gmail' },
      },
    });

    mockFetch
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'new_token', expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'msg_1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const sender = new GmailSender({
      id: integration.id,
      accessToken: integration.accessToken,
      refreshToken: integration.refreshToken,
      tokenExpiresAt: integration.tokenExpiresAt,
    });

    await sender.send({
      to: 'customer@example.test',
      fromAddress: 'merchant@gmail.test',
      fromName: 'Merchant',
      subject: 'Hi',
      text: 'Hello',
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(String(mockFetch.mock.calls[1][0])).toBe('https://oauth2.googleapis.com/token');
    expect(String(mockFetch.mock.calls[2][0])).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');

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
        externalAccountId: 'merchant@gmail.test',
        accessToken: 'stale',
        refreshToken: 'refresh_token',
        tokenExpiresAt: new Date(Date.now() - 1000),
        metadata: { provider: 'gmail' },
      },
    });

    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'fresh', expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'msg' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const sender = new GmailSender({
      id: integration.id,
      accessToken: integration.accessToken,
      refreshToken: integration.refreshToken,
      tokenExpiresAt: integration.tokenExpiresAt,
    });

    await sender.send({
      to: 'c@x.test',
      fromAddress: 'merchant@gmail.test',
      fromName: 'M',
      subject: 'Hi',
      text: 'Hi',
    });

    expect(String(mockFetch.mock.calls[0][0])).toBe('https://oauth2.googleapis.com/token');
    expect(String(mockFetch.mock.calls[1][0])).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    const init = mockFetch.mock.calls[1][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fresh');
  });
});
