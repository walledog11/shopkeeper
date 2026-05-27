import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, SenderType, db } from '@clerk/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestOrg,
  createTestThread,
} from '@clerk/db/test-helpers';
import { readOutboundRecords } from '@/lib/server/outbound-recorder';
import { escalateToHuman, sendEmail, sendReply, updateThreadStatus, ESCALATION_MARKER } from './thread';
import { AGENT_NOTE_PREFIX, THREAD_STATUS } from '@/lib/messaging/thread-constants';

const { mockEnqueueCustomerMemory } = vi.hoisted(() => ({
  mockEnqueueCustomerMemory: vi.fn(),
}));

vi.mock('@/lib/server/customer-memory', () => ({
  enqueueCustomerMemoryForClosedThreads: mockEnqueueCustomerMemory,
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
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'clerk-agent-records-'));
  process.env.E2E_OUTBOUND_MODE = 'record';
  process.env.E2E_OUTBOUND_RECORD_PATH = path.join(tempDir, 'records.jsonl');
  delete process.env.POSTMARK_API_KEY;
  mockEnqueueCustomerMemory.mockClear();
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

    expect(result).toBe('Reply sent to customer via email.');
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

    expect(result).toBe('Reply sent to customer via email.');
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

describe('sendEmail outbound recording', () => {
  it('records a new Outlook email with the Outlook provider', async () => {
    const emailAddress = `outlook_${org.id.slice(0, 8)}@example.com`;
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.email,
        externalAccountId: emailAddress,
        fromEmail: emailAddress,
        accessToken: 'outlook-access-token',
        refreshToken: 'outlook-refresh-token',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        metadata: { provider: 'outlook' },
      },
    });

    const result = await sendEmail(
      { to: 'prospect@example.com', subject: 'Sizing question', body: 'Recorded Outlook email.' },
      { threadId: 'unused-for-send-email', orgId: org.id, orgName: org.name },
    );

    expect(result).toBe('Email sent to prospect@example.com and a new ticket was opened.');
    const records = await readOutboundRecords();
    expect(records).toMatchObject([
      {
        source: 'agent_send_email',
        provider: 'outlook',
        channel: 'email',
        organizationId: org.id,
        to: 'prospect@example.com',
        from: emailAddress,
        subject: 'Sizing question',
        text: 'Recorded Outlook email.',
      },
    ]);

    const saved = await db.message.findFirst({
      where: { contentText: 'Recorded Outlook email.', senderType: SenderType.agent },
    });
    expect(saved).not.toBeNull();
  });
});

describe('updateThreadStatus', () => {
  it('enqueues a customer memory update when the agent closes a thread', async () => {
    const customer = await createTestCustomer(org.id, 'agent-close@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const result = await updateThreadStatus(
      { status: THREAD_STATUS.CLOSED },
      { threadId: thread.id, orgId: org.id, orgName: org.name },
    );

    expect(result).toBe('Thread status updated to "closed".');
    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.status).toBe(THREAD_STATUS.CLOSED);
    expect(mockEnqueueCustomerMemory).toHaveBeenCalledWith({
      organizationId: org.id,
      threads: [{ threadId: thread.id, closedAt: expect.any(Date) }],
    });
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

    expect(result.startsWith(ESCALATION_MARKER)).toBe(true);
    expect(result).toContain('Customer is asking about wholesale pricing.');

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

    expect(result).toContain('No reason provided');

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
