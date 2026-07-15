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
import { readOutboundRecords } from '@/lib/server/outbound-recorder';
import { escalateToHuman, sendEmail, sendReply, updateThreadStatus } from './thread';
import { AGENT_NOTE_PREFIX, THREAD_STATUS } from '@shopkeeper/agent/thread-constants';

const {
  mockPostmarkSend,
  mockRecordEmailSendFailure,
  mockRecordInstagramSendFailure,
} = vi.hoisted(() => ({
  mockPostmarkSend: vi.fn(),
  mockRecordEmailSendFailure: vi.fn(),
  mockRecordInstagramSendFailure: vi.fn(),
}));

vi.mock('postmark', () => ({
  ServerClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.sendEmail = mockPostmarkSend;
  }),
}));

vi.mock('@/lib/messaging/provider-send-failures', () => ({
  recordEmailSendFailure: mockRecordEmailSendFailure,
  recordInstagramSendFailure: mockRecordInstagramSendFailure,
}));

let org!: Awaited<ReturnType<typeof createTestOrg>>;
let tempDir: string | null = null;
const originalEnv = {
  E2E_OUTBOUND_MODE: process.env.E2E_OUTBOUND_MODE,
  E2E_OUTBOUND_RECORD_PATH: process.env.E2E_OUTBOUND_RECORD_PATH,
  POSTMARK_API_KEY: process.env.POSTMARK_API_KEY,
};

beforeEach(async () => {
  org = await createTestOrg();
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'shopkeeper-agent-records-'));
  process.env.E2E_OUTBOUND_MODE = 'record';
  process.env.E2E_OUTBOUND_RECORD_PATH = path.join(tempDir, 'records.jsonl');
  delete process.env.POSTMARK_API_KEY;
  mockPostmarkSend.mockReset().mockResolvedValue({ MessageID: 'mock-message-id' });
  mockRecordEmailSendFailure.mockReset().mockResolvedValue(undefined);
  mockRecordInstagramSendFailure.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  process.env.E2E_OUTBOUND_MODE = originalEnv.E2E_OUTBOUND_MODE;
  process.env.E2E_OUTBOUND_RECORD_PATH = originalEnv.E2E_OUTBOUND_RECORD_PATH;
  process.env.POSTMARK_API_KEY = originalEnv.POSTMARK_API_KEY;

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe('sendReply outbound recording', () => {
  it('records an email reply and persists the agent message without Postmark credentials', async () => {
    const emailAddress = `support_${org.id.slice(0, 8)}@example.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });
    const customer = await createTestCustomer(org.id, 'customer@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const result = await sendReply(
      { text: 'Recorded agent reply.' },
      { threadId: thread.id, orgId: org.id, orgName: org.name },
    );

    expect(result.message).toBe('Reply sent to customer via email.');
    const records = await readOutboundRecords();
    expect(records).toMatchObject([
      {
        source: 'agent_send_reply',
        provider: 'postmark',
        channel: 'email',
        organizationId: org.id,
        threadId: thread.id,
        to: 'customer@example.com',
        from: emailAddress,
        text: 'Recorded agent reply.',
      },
    ]);

    const saved = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(saved?.contentText).toBe('Recorded agent reply.');
  });

  it('records a Gmail reply with the Gmail provider', async () => {
    const emailAddress = `gmail_${org.id.slice(0, 8)}@example.com`;
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.email,
        externalAccountId: emailAddress,
        fromEmail: emailAddress,
        accessToken: 'gmail-access-token',
        refreshToken: 'gmail-refresh-token',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        metadata: { provider: 'gmail' },
      },
    });
    const customer = await createTestCustomer(org.id, 'gmail-customer@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const result = await sendReply(
      { text: 'Recorded Gmail reply.' },
      { threadId: thread.id, orgId: org.id, orgName: org.name },
    );

    expect(result.message).toBe('Reply sent to customer via email.');
    const records = await readOutboundRecords();
    expect(records).toMatchObject([
      {
        source: 'agent_send_reply',
        provider: 'gmail',
        channel: 'email',
        organizationId: org.id,
        threadId: thread.id,
        to: 'gmail-customer@example.com',
        from: emailAddress,
        text: 'Recorded Gmail reply.',
      },
    ]);
  });
});

describe('sendReply provider failures', () => {
  it('preserves the agent-specific Instagram provider error message', async () => {
    process.env.E2E_OUTBOUND_MODE = 'live';
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
    await db.integration.update({
      where: { id: integration.id },
      data: { tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    const customer = await createTestCustomer(org.id, 'ig-provider-failure');
    const thread = await createTestThread(org.id, customer.id, ChannelType.ig_dm);
    await db.thread.update({
      where: { id: thread.id },
      data: {
        replyIntegrationId: integration.id,
        replyIntegrationUpdatedAt: new Date(),
      },
    });
    await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        integrationId: integration.id,
        senderType: SenderType.customer,
        contentText: 'Inbound Instagram message',
        externalMessageId: `mid-inbound-${thread.id}`,
        sentAt: new Date(),
      },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 190 } }), { status: 400 }),
    );

    try {
      const result = await sendReply(
        { text: 'This will fail.' },
        { threadId: thread.id, orgId: org.id, orgName: org.name },
      );

      expect(result).toEqual({
        status: 'error',
        message: 'Error: Instagram connection expired — reconnect Instagram to reply.',
      });
      expect(mockRecordInstagramSendFailure).toHaveBeenCalledWith({
        organizationId: org.id,
        threadId: thread.id,
        integrationId: integration.id,
        detail: 'Instagram token expired or revoked',
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('does not let agent mode bypass the Instagram reply window', async () => {
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.ig_dm,
      externalAccountId: `ig_window_${org.id.slice(0, 8)}`,
      accessToken: 'test-ig-token',
      metadata: { instagram: { authModel: 'instagram_login' } },
    });
    await db.integration.update({
      where: { id: integration.id },
      data: { tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    const customer = await createTestCustomer(org.id, 'ig-agent-window');
    const thread = await createTestThread(org.id, customer.id, ChannelType.ig_dm);
    const providerSentAt = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1);
    await db.thread.update({
      where: { id: thread.id },
      data: {
        replyIntegrationId: integration.id,
        replyIntegrationUpdatedAt: providerSentAt,
      },
    });
    await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        integrationId: integration.id,
        senderType: SenderType.customer,
        contentText: 'Old inbound Instagram message',
        externalMessageId: `mid-old-${thread.id}`,
        sentAt: providerSentAt,
      },
    });

    const result = await sendReply(
      { text: 'This must not send.' },
      {
        agentActionMode: 'auto_executed',
        threadId: thread.id,
        orgId: org.id,
        orgName: org.name,
      },
    );

    expect(result).toEqual({
      status: 'error',
      message: "Error: Instagram only allows replies within 24 hours of the customer's last message.",
    });
    expect(await readOutboundRecords()).toEqual([]);
  });

  it('preserves the agent-specific email provider error message', async () => {
    process.env.E2E_OUTBOUND_MODE = 'live';
    process.env.POSTMARK_API_KEY = 'test-postmark-key';
    mockPostmarkSend.mockRejectedValueOnce(new Error('postmark down'));
    const emailAddress = `email_fail_${org.id.slice(0, 8)}@example.com`;
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });
    const customer = await createTestCustomer(org.id, 'email-provider-failure@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const result = await sendReply(
      { text: 'This will fail.' },
      { threadId: thread.id, orgId: org.id, orgName: org.name },
    );

    expect(result).toEqual({
      status: 'error',
      message: 'Error: email dispatch failed — postmark down',
    });
    expect(mockRecordEmailSendFailure).toHaveBeenCalledWith({
      provider: 'postmark',
      organizationId: org.id,
      threadId: thread.id,
      integrationId: integration.id,
      detail: 'postmark down',
      originalChannel: undefined,
    });
  });
});

describe('thread tool tenant ownership', () => {
  it('does not send, mutate, or escalate a thread owned by another organization', async () => {
    const otherOrg = await createTestOrg();
    try {
      const customer = await createTestCustomer(otherOrg.id, 'other-tenant@example.com');
      const thread = await createTestThread(otherOrg.id, customer.id, ChannelType.email);
      const ctx = { threadId: thread.id, orgId: org.id, orgName: org.name };

      await expect(sendReply({ text: 'Cross-tenant reply' }, ctx)).resolves.toEqual({
        status: 'error',
        message: 'Error: thread not found.',
      });
      await expect(updateThreadStatus({ status: THREAD_STATUS.CLOSED }, ctx)).resolves.toEqual({
        status: 'error',
        message: 'Error: thread not found.',
      });
      await expect(escalateToHuman({ reason: 'Cross-tenant escalation' }, ctx)).resolves.toEqual({
        status: 'error',
        message: 'Error: thread not found.',
      });

      const unchanged = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
      expect(unchanged.status).toBe(THREAD_STATUS.OPEN);
      await expect(db.message.count({ where: { threadId: thread.id } })).resolves.toBe(0);
      await expect(readOutboundRecords()).resolves.toEqual([]);
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });
});

describe('sendEmail outbound recording', () => {
  it('records a new Gmail email with the Gmail provider', async () => {
    const emailAddress = `gmail_send_${org.id.slice(0, 8)}@example.com`;
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.email,
        externalAccountId: emailAddress,
        fromEmail: emailAddress,
        accessToken: 'gmail-access-token',
        refreshToken: 'gmail-refresh-token',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        metadata: { provider: 'gmail' },
      },
    });

    const result = await sendEmail(
      { to: 'prospect@example.com', subject: 'Sizing question', body: 'Recorded Gmail email.' },
      { threadId: 'unused-for-send-email', orgId: org.id, orgName: org.name },
    );

    expect(result.message).toBe('Email sent to prospect@example.com and a new ticket was opened.');
    const records = await readOutboundRecords();
    expect(records).toMatchObject([
      {
        source: 'agent_send_email',
        provider: 'gmail',
        channel: 'email',
        organizationId: org.id,
        to: 'prospect@example.com',
        from: emailAddress,
        subject: 'Sizing question',
        text: 'Recorded Gmail email.',
      },
    ]);

    const saved = await db.message.findFirst({
      where: { contentText: 'Recorded Gmail email.', senderType: SenderType.agent },
    });
    expect(saved).not.toBeNull();
  });
});

describe('sendEmail async outbound (OUTBOUND_EMAIL_ASYNC)', () => {
  const originalFetch = global.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    process.env.OUTBOUND_EMAIL_ASYNC = 'true';
    global.fetch = mockFetch as typeof fetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    delete process.env.OUTBOUND_EMAIL_ASYNC;
    global.fetch = originalFetch;
  });

  it('pre-creates a pending message, stores the subject, and enqueues instead of sending', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ enqueued: true, jobId: 'j1' }), { status: 202 }),
    );
    const emailAddress = `support_async_${org.id.slice(0, 8)}@example.com`;
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });

    const result = await sendEmail(
      { to: 'prospect-async@example.com', subject: 'Sizing question', body: 'Queued email.' },
      { threadId: 'unused-for-send-email', orgId: org.id, orgName: org.name },
    );

    expect(result.message).toBe(
      'Email queued to prospect-async@example.com and a new ticket was opened.',
    );
    expect(mockPostmarkSend).not.toHaveBeenCalled();

    const saved = await db.message.findFirst({
      where: { contentText: 'Queued email.', senderType: SenderType.agent },
    });
    expect(saved?.sendStatus).toBe('pending');
    expect(saved?.integrationId).toBe(integration.id);

    // The new thread stores the subject so the worker can derive the outbound subject.
    const thread = await db.thread.findUnique({ where: { id: saved!.threadId } });
    expect(thread?.subject).toBe('Sizing question');

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/internal/queue/outbound-email');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      organizationId: org.id,
      messageId: saved?.id,
      threadId: saved?.threadId,
      integrationId: integration.id,
      source: 'agent_send_email',
    });
  });

  it('uses the proactive default even when the recipient thread last received via another provider', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ enqueued: true, jobId: 'j-default' }), { status: 202 }),
    );
    const gmail = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.gmail,
      externalAccountId: `gmail-${org.id}@example.com`,
      metadata: { provider: 'gmail' },
    });
    const postmark = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      emailProvider: EmailProvider.postmark,
      externalAccountId: `postmark-${org.id}@example.com`,
      metadata: { provider: 'postmark' },
    });
    await db.organization.update({
      where: { id: org.id },
      data: { defaultEmailIntegrationId: gmail.id },
    });
    const customer = await createTestCustomer(org.id, 'existing-prospect@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({
      where: { id: thread.id },
      data: {
        replyIntegrationId: postmark.id,
        replyIntegrationUpdatedAt: new Date(),
      },
    });

    const result = await sendEmail(
      {
        to: customer.platformId,
        subject: 'Proactive follow-up',
        body: 'Checking in.',
      },
      { threadId: 'unused-for-send-email', orgId: org.id, orgName: org.name },
    );

    expect(result.status).toBe('ok');
    const saved = await db.message.findFirstOrThrow({
      where: { threadId: thread.id, contentText: 'Checking in.' },
    });
    expect(saved.integrationId).toBe(gmail.id);
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      integrationId: gmail.id,
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

    const result = await sendEmail(
      { to: 'prospect-fail@example.com', subject: 'Q', body: 'Will fail to queue.' },
      { threadId: 'unused-for-send-email', orgId: org.id, orgName: org.name },
    );

    expect(result.status).toBe('error');
    const saved = await db.message.findFirst({
      where: { contentText: 'Will fail to queue.', senderType: SenderType.agent },
    });
    expect(saved?.sendStatus).toBe('failed');
    expect(saved?.sendError).toBe('Could not queue email send');
  });
});

describe('updateThreadStatus', () => {
  it('updates thread status when the agent closes a thread', async () => {
    const customer = await createTestCustomer(org.id, 'agent-close@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const result = await updateThreadStatus(
      { status: THREAD_STATUS.CLOSED },
      { threadId: thread.id, orgId: org.id, orgName: org.name },
    );

    expect(result.message).toBe('Thread status updated to "closed".');
    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.status).toBe(THREAD_STATUS.CLOSED);
  });
});

describe('escalateToHuman', () => {
  it('flips the thread to pending, tags it needs_human, and writes an audit note', async () => {
    const customer = await createTestCustomer(org.id, 'escalation@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const result = await escalateToHuman(
      { reason: 'Customer is asking about wholesale pricing.' },
      { threadId: thread.id, orgId: org.id, orgName: org.name },
    );

    expect(result.status).toBe('escalated');
    expect(result.message).toContain('Customer is asking about wholesale pricing.');

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.status).toBe(THREAD_STATUS.PENDING);
    expect(updated?.tag).toBe('needs_human');

    const note = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.note },
      orderBy: { sentAt: 'desc' },
    });
    expect(note?.contentText).toBe(`${AGENT_NOTE_PREFIX}Escalated to merchant: Customer is asking about wholesale pricing.`);
  });

  it('falls back to "No reason provided" when reason is whitespace', async () => {
    const customer = await createTestCustomer(org.id, 'escalation-blank@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const result = await escalateToHuman(
      { reason: '   ' },
      { threadId: thread.id, orgId: org.id, orgName: org.name },
    );

    expect(result.message).toContain('No reason provided');

    const note = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.note },
    });
    expect(note?.contentText).toContain('No reason provided');
  });

  it('fires a fire-and-forget POST to the gateway escalation endpoint', async () => {
    const customer = await createTestCustomer(org.id, 'escalation-push@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const prevSecret = process.env.INTERNAL_API_SECRET;
    const prevGateway = process.env.GATEWAY_INTERNAL_URL;
    const prevPublic = process.env.GATEWAY_PUBLIC_URL;
    process.env.INTERNAL_API_SECRET = 'test-internal-secret';
    process.env.GATEWAY_INTERNAL_URL = 'http://gateway.test';
    delete process.env.GATEWAY_PUBLIC_URL;

    let resolveSeen: (() => void) | undefined;
    const seen = new Promise<void>((resolve) => {
      resolveSeen = resolve;
    });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url, init) => {
        calls.push({ url: String(url), init });
        resolveSeen?.();
        return new Response(JSON.stringify({ notified: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

    try {
      await escalateToHuman(
        { reason: 'Wholesale pricing.' },
        { threadId: thread.id, orgId: org.id, orgName: org.name },
      );

      await seen;

      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('http://gateway.test/internal/operator/escalate');
      expect(calls[0]?.init?.method).toBe('POST');
      const headers = calls[0]?.init?.headers as Record<string, string>;
      expect(headers['x-internal-secret']).toBe('test-internal-secret');
      const parsed = JSON.parse(calls[0]?.init?.body as string);
      expect(parsed).toEqual({
        organizationId: org.id,
        threadId: thread.id,
        reason: 'Wholesale pricing.',
      });
    } finally {
      fetchSpy.mockRestore();
      if (prevSecret === undefined) delete process.env.INTERNAL_API_SECRET;
      else process.env.INTERNAL_API_SECRET = prevSecret;
      if (prevGateway === undefined) delete process.env.GATEWAY_INTERNAL_URL;
      else process.env.GATEWAY_INTERNAL_URL = prevGateway;
      if (prevPublic === undefined) delete process.env.GATEWAY_PUBLIC_URL;
      else process.env.GATEWAY_PUBLIC_URL = prevPublic;
    }
  });
});
