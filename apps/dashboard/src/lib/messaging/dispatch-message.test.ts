import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, SenderType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

const { mockFetch, mockPostmarkSend, mockRecordProviderSendFailure } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockPostmarkSend: vi.fn(),
  mockRecordProviderSendFailure: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);

vi.mock('postmark', () => ({
  ServerClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.sendEmail = mockPostmarkSend;
  }),
}));

vi.mock('@/lib/server/redis', () => ({
  getRedis: vi.fn(() => ({ incr: vi.fn(), expire: vi.fn() })),
}));

vi.mock('@/lib/server/provider-send-alerts', () => ({
  recordProviderSendFailure: mockRecordProviderSendFailure,
}));

import { dispatchMessage } from './dispatch-message';
import { readOutboundRecords } from '@/lib/server/outbound-recorder';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
let tempDir: string | null = null;
const originalEnv = {
  E2E_OUTBOUND_MODE: process.env.E2E_OUTBOUND_MODE,
  E2E_OUTBOUND_RECORD_PATH: process.env.E2E_OUTBOUND_RECORD_PATH,
  INBOUND_EMAIL_DOMAIN: process.env.INBOUND_EMAIL_DOMAIN,
  OUTBOUND_EMAIL_ASYNC: process.env.OUTBOUND_EMAIL_ASYNC,
  TIKTOK_SHOP_API_BASE_URL: process.env.TIKTOK_SHOP_API_BASE_URL,
  TIKTOK_SHOP_APP_KEY: process.env.TIKTOK_SHOP_APP_KEY,
  TIKTOK_SHOP_APP_SECRET: process.env.TIKTOK_SHOP_APP_SECRET,
  TIKTOK_SHOP_ENABLED: process.env.TIKTOK_SHOP_ENABLED,
  TIKTOK_SHOP_SEND_MESSAGE_PATH: process.env.TIKTOK_SHOP_SEND_MESSAGE_PATH,
  TIKTOK_SHOP_TOKEN_URL: process.env.TIKTOK_SHOP_TOKEN_URL,
};

beforeEach(async () => {
  org = await createTestOrg();
  process.env.E2E_OUTBOUND_MODE = 'live';
  process.env.INBOUND_EMAIL_DOMAIN = 'mail.test';
  delete process.env.OUTBOUND_EMAIL_ASYNC;
  mockFetch.mockReset();
  mockPostmarkSend.mockReset().mockResolvedValue({ MessageID: 'mock-message-id' });
  mockRecordProviderSendFailure.mockReset().mockResolvedValue({ emitted: false });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  process.env.E2E_OUTBOUND_MODE = originalEnv.E2E_OUTBOUND_MODE;
  process.env.E2E_OUTBOUND_RECORD_PATH = originalEnv.E2E_OUTBOUND_RECORD_PATH;
  process.env.INBOUND_EMAIL_DOMAIN = originalEnv.INBOUND_EMAIL_DOMAIN;
  if (originalEnv.OUTBOUND_EMAIL_ASYNC === undefined) {
    delete process.env.OUTBOUND_EMAIL_ASYNC;
  } else {
    process.env.OUTBOUND_EMAIL_ASYNC = originalEnv.OUTBOUND_EMAIL_ASYNC;
  }
  restoreEnv('TIKTOK_SHOP_API_BASE_URL', originalEnv.TIKTOK_SHOP_API_BASE_URL);
  restoreEnv('TIKTOK_SHOP_APP_KEY', originalEnv.TIKTOK_SHOP_APP_KEY);
  restoreEnv('TIKTOK_SHOP_APP_SECRET', originalEnv.TIKTOK_SHOP_APP_SECRET);
  restoreEnv('TIKTOK_SHOP_ENABLED', originalEnv.TIKTOK_SHOP_ENABLED);
  restoreEnv('TIKTOK_SHOP_SEND_MESSAGE_PATH', originalEnv.TIKTOK_SHOP_SEND_MESSAGE_PATH);
  restoreEnv('TIKTOK_SHOP_TOKEN_URL', originalEnv.TIKTOK_SHOP_TOKEN_URL);

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe('dispatchMessage', () => {
  it('sends an email reply with reply headers and persists the agent message', async () => {
    const emailAddress = `support_${org.id.slice(0, 8)}@example.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });
    const customer = await createTestCustomer(org.id, 'customer@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { subject: 'Order status' } });
    const incomingMessageId = `<incoming-${thread.id}@example.test>`;
    await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        senderType: SenderType.customer,
        contentText: 'Where is it?',
        externalMessageId: incomingMessageId,
      },
    });

    const result = await dispatchMessage({ ...thread, customer }, org, 'It ships today.');

    expect(result).toMatchObject({ ok: true });
    expect(mockPostmarkSend).toHaveBeenCalledWith(expect.objectContaining({
      Subject: 'Re: Order status',
      Headers: [
        { Name: 'Message-ID', Value: `<thread-${thread.id}@mail.test>` },
        { Name: 'In-Reply-To', Value: incomingMessageId },
        { Name: 'References', Value: incomingMessageId },
      ],
    }));
    const saved = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(saved?.contentText).toBe('It ships today.');
  });

  it('records email provider failures without persisting an agent message', async () => {
    mockPostmarkSend.mockRejectedValueOnce(new Error('postmark down'));
    const emailAddress = `support_fail_${org.id.slice(0, 8)}@example.com`;
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });
    const customer = await createTestCustomer(org.id, 'email-failure@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const result = await dispatchMessage({ ...thread, customer }, org, 'This will fail.');

    expect(result).toEqual({
      ok: false,
      error: 'Email dispatch failed',
      detail: 'postmark down',
    });
    expect(mockRecordProviderSendFailure).toHaveBeenCalledWith(
      'postmark',
      'email',
      org.id,
      expect.objectContaining({
        threadId: thread.id,
        integrationId: integration.id,
        detail: 'postmark down',
      }),
    );
    await expect(db.message.count({
      where: { threadId: thread.id, senderType: SenderType.agent },
    })).resolves.toBe(0);
  });

  it.each([
    {
      response: { error: { code: 190 } },
      error: 'Instagram token expired',
      detail: 'Instagram token expired',
    },
    {
      response: { error: { code: 10, error_subcode: 2018278 } },
      error: "Instagram only allows replies within 24 hours of the customer's last message",
      detail: 'Outside Instagram 24-hour messaging window',
    },
  ])('returns and records Instagram provider failures: $detail', async ({ response, error, detail }) => {
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.ig_dm,
      externalAccountId: `ig_${org.id.slice(0, 8)}`,
      accessToken: 'test-ig-token',
    });
    const customer = await createTestCustomer(org.id, 'ig_customer');
    const thread = await createTestThread(org.id, customer.id, ChannelType.ig_dm);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 400 }));

    const result = await dispatchMessage({ ...thread, customer }, org, 'Instagram reply.');

    expect(result).toEqual({ ok: false, error, providerStatus: 400 });
    expect(mockRecordProviderSendFailure).toHaveBeenCalledWith(
      'meta',
      'ig_dm',
      org.id,
      expect.objectContaining({
        threadId: thread.id,
        integrationId: integration.id,
        detail,
      }),
    );
  });

  it('sends a TikTok Shop reply and persists the agent message after provider success', async () => {
    vi.stubEnv('TIKTOK_SHOP_ENABLED', 'true');
    vi.stubEnv('TIKTOK_SHOP_APP_KEY', 'tts-app-key');
    vi.stubEnv('TIKTOK_SHOP_APP_SECRET', 'tts-app-secret');
    vi.stubEnv('TIKTOK_SHOP_API_BASE_URL', 'https://open-api.tiktok.test');
    vi.stubEnv('TIKTOK_SHOP_SEND_MESSAGE_PATH', '/customer-service/messages/send');
    vi.stubEnv('TIKTOK_SHOP_TOKEN_URL', 'https://auth.tiktok.test/token');
    await createTestIntegration(org.id, {
      platform: ChannelType.tiktok,
      externalAccountId: `shop_${org.id.slice(0, 8)}`,
      accessToken: 'tts-access-token',
    });
    const customer = await createTestCustomer(org.id, `tiktok:shop_${org.id.slice(0, 8)}:buyer_123`);
    const thread = await createTestThread(org.id, customer.id, ChannelType.tiktok);
    const threadWithSpace = await db.thread.update({
      where: { id: thread.id },
      data: { externalSpaceId: 'conversation_123' },
      include: { customer: true },
    });
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: { message_id: 'tts_msg_1' } }), { status: 200 }));

    const result = await dispatchMessage(threadWithSpace, org, 'TikTok Shop reply.');

    expect(result).toMatchObject({ ok: true });
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe('https://open-api.tiktok.test/customer-service/messages/send?app_key=tts-app-key');
    expect(init).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer tts-access-token' }),
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      conversation_id: 'conversation_123',
      buyer_id: 'buyer_123',
      content: { text: 'TikTok Shop reply.' },
    });

    const saved = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(saved?.contentText).toBe('TikTok Shop reply.');
  });

  it('returns TikTok Shop provider errors without persisting an agent message', async () => {
    vi.stubEnv('TIKTOK_SHOP_ENABLED', 'true');
    vi.stubEnv('TIKTOK_SHOP_APP_KEY', 'tts-app-key');
    vi.stubEnv('TIKTOK_SHOP_APP_SECRET', 'tts-app-secret');
    vi.stubEnv('TIKTOK_SHOP_API_BASE_URL', 'https://open-api.tiktok.test');
    vi.stubEnv('TIKTOK_SHOP_SEND_MESSAGE_PATH', '/customer-service/messages/send');
    vi.stubEnv('TIKTOK_SHOP_TOKEN_URL', 'https://auth.tiktok.test/token');
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.tiktok,
      externalAccountId: 'shop_failure',
      accessToken: 'tts-access-token',
    });
    const customer = await createTestCustomer(org.id, 'tiktok:shop_failure:buyer_404');
    const thread = await createTestThread(org.id, customer.id, ChannelType.tiktok);
    const threadWithSpace = await db.thread.update({
      where: { id: thread.id },
      data: { externalSpaceId: 'conversation_404' },
      include: { customer: true },
    });
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'response_window_closed', message: 'window closed' }), { status: 400 }));

    const result = await dispatchMessage(threadWithSpace, org, 'Too late.');

    expect(result).toEqual({
      ok: false,
      error: 'TikTok Shop only allows replies inside the buyer-service response window',
      providerStatus: 400,
    });
    expect(mockRecordProviderSendFailure).toHaveBeenCalledWith(
      'tiktok_shop',
      'tiktok',
      org.id,
      expect.objectContaining({
        threadId: thread.id,
        integrationId: integration.id,
        detail: 'Outside TikTok Shop response window or policy',
      }),
    );
    await expect(db.message.count({
      where: { threadId: thread.id, senderType: SenderType.agent },
    })).resolves.toBe(0);
  });

  it('short-circuits provider calls when outbound recording succeeds', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'shopkeeper-dispatch-records-'));
    process.env.E2E_OUTBOUND_MODE = 'record';
    process.env.E2E_OUTBOUND_RECORD_PATH = path.join(tempDir, 'records.jsonl');

    const emailAddress = `support_record_${org.id.slice(0, 8)}@example.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });
    const emailCustomer = await createTestCustomer(org.id, 'record-email@example.com');
    const emailThread = await createTestThread(org.id, emailCustomer.id, ChannelType.email);

    await createTestIntegration(org.id, {
      platform: ChannelType.ig_dm,
      externalAccountId: `ig_record_${org.id.slice(0, 8)}`,
    });
    const igCustomer = await createTestCustomer(org.id, 'record_ig_customer');
    const igThread = await createTestThread(org.id, igCustomer.id, ChannelType.ig_dm);

    await expect(dispatchMessage({ ...emailThread, customer: emailCustomer }, org, 'Recorded email.'))
      .resolves.toMatchObject({ ok: true });
    await expect(dispatchMessage({ ...igThread, customer: igCustomer }, org, 'Recorded Instagram DM.'))
      .resolves.toMatchObject({ ok: true });

    expect(mockPostmarkSend).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(await readOutboundRecords()).toMatchObject([
      {
        source: 'dispatch_message',
        channel: 'email',
        threadId: emailThread.id,
        text: 'Recorded email.',
      },
      {
        source: 'dispatch_message',
        channel: 'ig_dm',
        threadId: igThread.id,
        text: 'Recorded Instagram DM.',
      },
    ]);
  });
});

describe('dispatchMessage — async outbound (OUTBOUND_EMAIL_ASYNC)', () => {
  beforeEach(() => {
    process.env.OUTBOUND_EMAIL_ASYNC = 'true';
  });

  it('pre-creates a pending message and enqueues instead of sending synchronously', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ enqueued: true, jobId: 'j1' }), { status: 202 }));
    const emailAddress = `support_async_${org.id.slice(0, 8)}@example.com`;
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });
    const customer = await createTestCustomer(org.id, 'async-email@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const result = await dispatchMessage({ ...thread, customer }, org, 'Queued reply.');

    expect(result).toMatchObject({ ok: true });
    expect(mockPostmarkSend).not.toHaveBeenCalled();

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/internal/queue/outbound-email');
    expect(init?.method).toBe('POST');
    const saved = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(saved?.sendStatus).toBe('pending');
    expect(JSON.parse(init.body as string)).toMatchObject({
      organizationId: org.id,
      messageId: saved?.id,
      threadId: thread.id,
      integrationId: integration.id,
      source: 'dispatch_message',
    });
  });

  it('marks the pending message failed when enqueue fails', async () => {
    mockFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const emailAddress = `support_async_fail_${org.id.slice(0, 8)}@example.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });
    const customer = await createTestCustomer(org.id, 'async-fail@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const result = await dispatchMessage({ ...thread, customer }, org, 'Will fail to queue.');

    expect(result).toEqual({ ok: false, error: 'Could not queue email send' });
    const saved = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(saved?.sendStatus).toBe('failed');
    expect(saved?.sendError).toBe('Could not queue email send');
  });
});
