import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, SenderType, db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestIntegration,
  createTestThread,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

// Mock outbound dispatch clients , we verify dispatch logic, not external APIs
vi.mock('postmark', () => ({
  ServerClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.sendEmail = vi.fn().mockResolvedValue({ MessageID: 'mock-msg-id' });
  }),
}));

// Mock global fetch for Meta Graph API calls in the IG dispatch branch
const { mockFetch, mockRecordProviderSendFailure } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockRecordProviderSendFailure: vi.fn().mockResolvedValue({ emitted: false }),
}));
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/lib/server/redis', () => ({
  getRedis: vi.fn(() => ({ incr: vi.fn(), expire: vi.fn() })),
}));

vi.mock('@/lib/server/provider-send-alerts', () => ({
  recordProviderSendFailure: mockRecordProviderSendFailure,
}));

import { POST } from './route';
import { auth } from '@clerk/nextjs/server';
import { ServerClient } from 'postmark';
import { readOutboundRecords } from '@/lib/server/outbound-recorder';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
let tempDir: string | null = null;
const originalEnv = {
  E2E_OUTBOUND_MODE: process.env.E2E_OUTBOUND_MODE,
  E2E_OUTBOUND_RECORD_PATH: process.env.E2E_OUTBOUND_RECORD_PATH,
  POSTMARK_API_KEY: process.env.POSTMARK_API_KEY,
};

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({ userId: 'usr_test', orgId: org.clerkOrgId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockFetch.mockReset();
  vi.mocked(ServerClient).mockClear();
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
  vi.clearAllMocks();
});

describe('POST /api/messages', () => {
  it('returns 400 for malformed JSON without dispatching', async () => {
    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when threadId or text is missing', async () => {
    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Missing threadId or text');
  });

  it('returns 404 when the thread belongs to a different org', async () => {
    const otherOrg = await createTestOrg();
    try {
      const customer = await createTestCustomer(otherOrg.id, 'cust_other@test.com');
      const thread = await createTestThread(otherOrg.id, customer.id, ChannelType.email);

      const req = new Request('http://localhost:3000/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: thread.id, text: 'Hey' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });

  it('blocks outbound writes when billing is past due', async () => {
    await db.organization.update({
      where: { id: org.id },
      data: { stripeStatus: 'past_due' },
    });
    const customer = await createTestCustomer(org.id, 'past_due_customer@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, text: 'This should not send' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(402);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Billing status past_due blocks write actions');

    const savedMessageCount = await db.message.count({ where: { threadId: thread.id } });
    expect(savedMessageCount).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('saves a note without calling any dispatch API', async () => {
    const customer = await createTestCustomer(org.id, 'note_cust@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, text: 'Internal note', isNote: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const savedMessage = await db.message.findFirst({ where: { threadId: thread.id } });
    expect(savedMessage?.senderType).toBe(SenderType.note);
    expect(savedMessage?.contentText).toBe('Internal note');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('dispatches via Meta Graph API for ig_dm threads and saves the message', async () => {
    const igAccountId = `ig_acct_${org.id.slice(0, 8)}`;
    await createTestIntegration(org.id, {
      platform: ChannelType.ig_dm,
      externalAccountId: igAccountId,
      accessToken: 'test-ig-token',
    });

    const customer = await createTestCustomer(org.id, 'ig_sender_456');
    const thread = await createTestThread(org.id, customer.id, ChannelType.ig_dm);

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message_id: 'mid_test' }), { status: 200 }),
    );

    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, text: 'Thanks for reaching out!' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('graph.facebook.com');

    const savedMessage = await db.message.findFirst({ where: { threadId: thread.id } });
    expect(savedMessage?.senderType).toBe(SenderType.agent);
    expect(savedMessage?.contentText).toBe('Thanks for reaching out!');
  });

  it('returns 502 when no IG integration is configured', async () => {
    const customer = await createTestCustomer(org.id, 'ig_no_integration_456');
    const thread = await createTestThread(org.id, customer.id, ChannelType.ig_dm);

    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, text: 'Hey' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it('returns 502 for unsupported channels without saving an agent message', async () => {
    const customer = await createTestCustomer(org.id, 'tiktok_sender_456');
    const thread = await createTestThread(org.id, customer.id, ChannelType.tiktok);

    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, text: 'Reply should not persist' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Unsupported channel');

    const agentMessageCount = await db.message.count({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(agentMessageCount).toBe(0);
  });

  it('dispatches via Postmark for email threads and saves the message', async () => {
    const emailAddress = `support_${org.id.slice(0, 8)}@acme.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });

    const customer = await createTestCustomer(org.id, 'customer@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, text: 'Your issue has been resolved.' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const savedMessage = await db.message.findFirst({ where: { threadId: thread.id } });
    expect(savedMessage?.senderType).toBe(SenderType.agent);
  });

  it('records email dispatch and skips Postmark in E2E recording mode', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'clerk-message-records-'));
    process.env.E2E_OUTBOUND_MODE = 'record';
    process.env.E2E_OUTBOUND_RECORD_PATH = path.join(tempDir, 'records.jsonl');
    delete process.env.POSTMARK_API_KEY;

    const emailAddress = `support_record_${org.id.slice(0, 8)}@acme.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });

    const customer = await createTestCustomer(org.id, 'recorded-customer@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, text: 'Recorded manual reply.' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(ServerClient).not.toHaveBeenCalled();

    const records = await readOutboundRecords();
    expect(records).toMatchObject([
      {
        source: 'dispatch_message',
        provider: 'postmark',
        channel: 'email',
        organizationId: org.id,
        threadId: thread.id,
        to: 'recorded-customer@example.com',
        from: emailAddress,
        text: 'Recorded manual reply.',
      },
    ]);

    const savedMessage = await db.message.findFirst({ where: { threadId: thread.id } });
    expect(savedMessage?.senderType).toBe(SenderType.agent);
  });

  it('promotes filtered → genuine and writes confirmed_genuine on outbound dispatch', async () => {
    const emailAddress = `support_${org.id.slice(0, 8)}@acme.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });

    const customer = await createTestCustomer(org.id, 'recovered@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { filterStatus: 'filtered' } });

    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, text: 'Hi , sorry for the delay.' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.filterStatus).toBe('genuine');
    expect(updated?.filterFeedback).toBe('confirmed_genuine');
  });

  it('writes confirmed_genuine on a questionable thread without changing filterStatus', async () => {
    const emailAddress = `support2_${org.id.slice(0, 8)}@acme.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });

    const customer = await createTestCustomer(org.id, 'maybe@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { filterStatus: 'questionable' } });

    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, text: 'Got it!' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.filterStatus).toBe('questionable');
    expect(updated?.filterFeedback).toBe('confirmed_genuine');
  });

  it('does not touch filter columns for a genuine thread', async () => {
    const emailAddress = `support3_${org.id.slice(0, 8)}@acme.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });

    const customer = await createTestCustomer(org.id, 'normal@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, text: 'Sure thing.' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.filterStatus).toBe('genuine');
    expect(updated?.filterFeedback).toBe('none');
  });

  it('returns 502 when POSTMARK_API_KEY is not set', async () => {
    const original = process.env.POSTMARK_API_KEY;
    delete process.env.POSTMARK_API_KEY;

    try {
      const customer = await createTestCustomer(org.id, 'no_postmark@example.com');
      const thread = await createTestThread(org.id, customer.id, ChannelType.email);

      const req = new Request('http://localhost:3000/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: thread.id, text: 'Hi' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(502);
    } finally {
      if (original !== undefined) process.env.POSTMARK_API_KEY = original;
    }
  });

  it('records provider send failures without saving a successful agent message', async () => {
    vi.mocked(ServerClient).mockImplementationOnce(function (this: { sendEmail: ReturnType<typeof vi.fn> }) {
      this.sendEmail = vi.fn().mockRejectedValue(new Error('postmark down'));
    } as unknown as typeof ServerClient);

    const emailAddress = `support_fail_${org.id.slice(0, 8)}@acme.com`;
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });

    const customer = await createTestCustomer(org.id, 'dispatch-fail@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const req = new Request('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id, text: 'This should fail before persistence.' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);

    expect(mockRecordProviderSendFailure).toHaveBeenCalledWith('postmark', 'email', org.id, expect.objectContaining({
      threadId: thread.id,
      integrationId: integration.id,
      detail: 'postmark down',
    }));

    const agentMessageCount = await db.message.count({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(agentMessageCount).toBe(0);
  });
});
