import { randomUUID } from 'node:crypto';

import { mkdtemp, rm } from 'node:fs/promises';

import os from 'node:os';

import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChannelType, EmailProvider, SenderType, db } from '@shopkeeper/db';

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
  vi.unstubAllEnvs();
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

it('delivers storefront replies only while the session is live and chat is enabled', async () => {
  vi.stubEnv('STOREFRONT_CHAT_ENABLED', 'true');
  const integration = await createTestIntegration(org.id, {
    platform: ChannelType.shopify, metadata: { storefrontChat: { enabled: true } },
  });
  const customer = await createTestCustomer(org.id, 'storefront-delivery');
  const thread = await createTestThread(org.id, customer.id, ChannelType.shopify_chat);
  const session = await db.storefrontChatSession.create({ data: {
    organizationId: org.id, integrationId: integration.id, storefrontHost: integration.externalAccountId,
    threadId: thread.id, resumeSecretHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60_000),
  } });
  const deliver = () => dispatchMessage({ ...thread, customer }, org, 'Storefront reply', { source: 'agent_send_reply' });
  const sent = await deliver();
  expect(sent.ok).toBe(true);
  expect(sent.ok && sent.message.sendStatus).toBe('sent');
  await db.storefrontChatSession.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } });
  expect((await deliver()).ok).toBe(false);
  await db.storefrontChatSession.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + 60_000) } });
  await db.integration.update({ where: { id: integration.id }, data: { metadata: { storefrontChat: { enabled: false } } } });
  expect((await deliver()).ok).toBe(false);
  expect(await db.message.count({ where: { threadId: thread.id, sendStatus: 'sent' } })).toBe(1);
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function createInstagramLoginIntegration() {
  const integration = await createTestIntegration(org.id, {
    platform: ChannelType.ig_dm,
    externalAccountId: `ig_${org.id.slice(0, 8)}`,
    accessToken: 'test-ig-token',
    metadata: {
      instagram: {
        authModel: 'instagram_login',
        grantedScopes: [
          'instagram_business_basic',
          'instagram_business_manage_messages',
        ],
        permissionsVerified: true,
      },
    },
  });
  return db.integration.update({
    where: { id: integration.id },
    data: { tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });
}

async function routeInstagramThread(
  threadId: string,
  integrationId: string,
  customerMessageAt = new Date(),
) {
  await db.thread.update({
    where: { id: threadId },
    data: {
      replyIntegrationId: integrationId,
      replyIntegrationUpdatedAt: customerMessageAt,
    },
  });
  await db.message.create({
    data: {
      threadId,
      organizationId: org.id,
      senderType: SenderType.customer,
      contentText: 'Inbound Instagram message',
      externalMessageId: `mid-inbound-${threadId}`,
      integrationId,
      sentAt: customerMessageAt,
    },
  });
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
    expect(saved?.integrationId).not.toBeNull();
  });

  it('records the provider attempt before a synchronous agent reply reaches email', async () => {
    const emailAddress = `support_attempt_${org.id.slice(0, 8)}@example.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });
    const customer = await createTestCustomer(org.id, 'agent-attempt@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    mockPostmarkSend.mockImplementationOnce(async () => {
      const pending = await db.message.findFirstOrThrow({
        where: { threadId: thread.id, senderType: SenderType.agent },
      });
      expect(pending.sendStatus).toBe('pending');
      expect(pending.sendAttemptedAt).not.toBeNull();
      return { MessageID: 'agent-attempt-message-id' };
    });

    const result = await dispatchMessage({ ...thread, customer }, org, 'We handled it.', {
      source: 'agent_send_reply',
    });

    expect(result).toMatchObject({ ok: true });
    const sent = await db.message.findFirstOrThrow({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(sent.sendStatus).toBe('sent');
    expect(sent.sendAttemptedAt).not.toBeNull();
    expect(sent.providerMessageId).toBe('agent-attempt-message-id');
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
      outcome: 'unknown',
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
      error: 'Instagram connection expired — reconnect Instagram to reply',
      detail: 'Instagram token expired or revoked',
      status: 400,
    },
    {
      response: { error: { code: 10, error_subcode: 2018278 } },
      error: "Instagram only allows replies within 24 hours of the customer's last message",
      detail: 'Outside Instagram 24-hour messaging window',
      status: 400,
    },
    {
      response: { error: { code: 10 } },
      error: 'Instagram messaging permission is missing — reconnect Instagram',
      detail: 'Instagram messaging permission missing',
      status: 403,
    },
    {
      response: { error: { code: 4 } },
      error: 'Instagram is rate limiting replies — try again later',
      detail: 'Instagram rate limit exceeded',
      status: 429,
    },
    {
      // A 5xx may have been delivered anyway, so it is not a refusal to retry.
      response: { error: { code: 2 } },
      error: "Instagram didn't confirm this message, so it may already have reached the customer. Check Instagram before sending it again",
      detail: 'Instagram provider temporarily unavailable',
      status: 503,
      outcome: 'unknown' as const,
    },
  ])('returns and records Instagram provider failures: $detail', async ({
    response,
    error,
    detail,
    status,
    outcome,
  }) => {
    const integration = await createInstagramLoginIntegration();
    const customer = await createTestCustomer(org.id, 'ig_customer');
    const thread = await createTestThread(org.id, customer.id, ChannelType.ig_dm);
    await routeInstagramThread(thread.id, integration.id);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(response), { status }));

    const result = await dispatchMessage({ ...thread, customer }, org, 'Instagram reply.');

    expect(result).toEqual({ ok: false, error, providerStatus: status, ...(outcome && { outcome }) });
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

    const igIntegration = await createInstagramLoginIntegration();
    const igCustomer = await createTestCustomer(org.id, 'record_ig_customer');
    const igThread = await createTestThread(org.id, igCustomer.id, ChannelType.ig_dm);
    await routeInstagramThread(igThread.id, igIntegration.id);

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

  // A draft or approval can outlive the conversation it was written for. When it
  // does, the send is refused rather than delivered late or quietly rerouted:
  // the text was composed from context the customer has already moved past.
  describe('a superseded episode', () => {
    async function rolledOverEmailThread() {
      const emailAddress = `support_${org.id.slice(0, 8)}@example.com`;
      await createTestIntegration(org.id, {
        platform: ChannelType.email,
        externalAccountId: emailAddress,
        fromEmail: emailAddress,
      });
      const customer = await createTestCustomer(org.id, `stale_${randomUUID()}@example.com`);
      const thread = await createTestThread(org.id, customer.id, ChannelType.email);
      await db.thread.update({
        where: { id: thread.id },
        data: { status: 'closed', closedReason: 'episode_rollover' },
      });
      return { thread, customer };
    }

    it('refuses the send with a typed conflict and never reaches the provider', async () => {
      const { thread, customer } = await rolledOverEmailThread();
      mockPostmarkSend.mockClear();

      const result = await dispatchMessage({ ...thread, customer }, org, 'About that refund…');

      expect(result).toMatchObject({ ok: false, code: 'episode_superseded' });
      expect(mockPostmarkSend).not.toHaveBeenCalled();
      expect(await db.message.count({
        where: { threadId: thread.id, senderType: SenderType.agent },
      })).toBe(0);
    });

    it('leaves the expired thread closed rather than reopening it', async () => {
      const { thread, customer } = await rolledOverEmailThread();

      await dispatchMessage({ ...thread, customer }, org, 'About that refund…');

      // The reopen used to be unconditional. Resurrecting this thread would put
      // two open threads on one customer/channel — what
      // threads_one_open_per_customer exists to forbid.
      const after = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
      expect(after.status).toBe('closed');
      expect(after.closedReason).toBe('episode_rollover');
    });

    it('still reopens a thread the merchant closed themselves', async () => {
      const emailAddress = `support_${org.id.slice(0, 8)}@example.com`;
      await createTestIntegration(org.id, {
        platform: ChannelType.email,
        externalAccountId: emailAddress,
        fromEmail: emailAddress,
      });
      const customer = await createTestCustomer(org.id, `resolved_${randomUUID()}@example.com`);
      const thread = await createTestThread(org.id, customer.id, ChannelType.email);
      await db.thread.update({
        where: { id: thread.id },
        data: { status: 'closed', closedReason: 'resolved' },
      });

      const result = await dispatchMessage({ ...thread, customer }, org, 'One more thing.');

      // Only an episode boundary blocks the reopen. Answering a ticket the
      // merchant resolved is ordinary and must keep working.
      expect(result).toMatchObject({ ok: true });
      const after = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
      expect(after.status).toBe('open');
    });
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
    expect(saved?.integrationId).toBe(integration.id);
    expect(JSON.parse(init.body as string)).toMatchObject({
      organizationId: org.id,
      messageId: saved?.id,
      threadId: thread.id,
      integrationId: integration.id,
      source: 'dispatch_message',
    });
  });

  it('snapshots the thread reply source instead of the proactive default', async () => {
    mockFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ enqueued: true, jobId: 'j-source' }),
      { status: 202 },
    ));
    const gmail = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.gmail,
      externalAccountId: `gmail-${org.id}@example.com`,
      metadata: { provider: 'gmail' },
    });
    const postmark = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.postmark,
      externalAccountId: `support-${org.id}@example.com`,
      metadata: { provider: 'postmark' },
    });
    await db.organization.update({
      where: { id: org.id },
      data: { defaultEmailIntegrationId: gmail.id },
    });
    const customer = await createTestCustomer(org.id, 'source-route@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({
      where: { id: thread.id },
      data: {
        replyIntegrationId: postmark.id,
        replyIntegrationUpdatedAt: new Date(),
      },
    });

    const result = await dispatchMessage({ ...thread, customer }, org, 'Route this reply.');

    expect(result).toMatchObject({ ok: true });
    const message = await db.message.findFirstOrThrow({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(message.integrationId).toBe(postmark.id);
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body as string)).toMatchObject({ integrationId: postmark.id });
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

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: 'Could not queue email send',
      message: expect.objectContaining({ id: expect.any(String) }),
    }));
    const saved = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(saved?.sendStatus).toBe('failed');
    expect(saved?.sendError).toBe('Could not queue email send');
  });

  it('marks an ambiguous enqueue network outcome unknown instead of retryable failed', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
    const emailAddress = `support_async_unknown_${org.id.slice(0, 8)}@example.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });
    const customer = await createTestCustomer(org.id, 'async-unknown@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const result = await dispatchMessage({ ...thread, customer }, org, 'Queue result is unclear.');

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: 'Email queue admission could not be confirmed',
      outcome: 'unknown',
      message: expect.objectContaining({ id: expect.any(String), sendStatus: 'unknown' }),
    }));
    const saved = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(saved?.sendStatus).toBe('unknown');
    expect(saved?.sendError).toBe('Email queue admission outcome unknown');
  });
});
