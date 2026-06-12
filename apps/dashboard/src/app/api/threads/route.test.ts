import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, SenderType, db, createMessage } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';

// Mock Clerk auth before any imports that depend on it
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { GET } from './route';
import { auth } from '@clerk/nextjs/server';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({ userId: 'usr_test', orgId: org.clerkOrgId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe('GET /api/threads', () => {
  it('returns open threads scoped to the org', async () => {
    const customer = await createTestCustomer(org.id, 'cust_platform_1', { name: 'Alice' });
    await createTestThread(org.id, customer.id, ChannelType.email);

    const req = new Request('http://localhost:3000/api/threads?status=open');
    const res = await GET(req);
    const body = await res.json() as { threads: unknown[]; nextCursor: string | null };

    expect(res.status).toBe(200);
    expect(body.threads).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });

  it('excludes threads from other orgs', async () => {
    const otherOrg = await createTestOrg();
    try {
      const customer = await createTestCustomer(otherOrg.id, 'cust_other', { name: 'Bob' });
      await createTestThread(otherOrg.id, customer.id, ChannelType.email);

      const req = new Request('http://localhost:3000/api/threads');
      const res = await GET(req);
      const body = await res.json() as { threads: unknown[] };

      expect(body.threads).toHaveLength(0);
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });

  it('excludes archived threads', async () => {
    const customer = await createTestCustomer(org.id, 'cust_archived', { name: 'Carol' });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { archivedAt: new Date() } });

    const req = new Request('http://localhost:3000/api/threads');
    const res = await GET(req);
    const body = await res.json() as { threads: unknown[] };

    expect(body.threads).toHaveLength(0);
  });

  it('excludes sms_agent and dashboard_agent channel threads', async () => {
    const customer = await createTestCustomer(org.id, 'cust_agent', { name: 'Dave' });
    await db.thread.create({
      data: { organizationId: org.id, customerId: customer.id, channelType: ChannelType.sms_agent, status: 'open' },
    });

    const req = new Request('http://localhost:3000/api/threads');
    const res = await GET(req);
    const body = await res.json() as { threads: unknown[] };

    expect(body.threads).toHaveLength(0);
  });

  it('supports cursor-based pagination via limit', async () => {
    // Each customer can only have one thread per channel — create 3 separate customers
    for (let i = 0; i < 3; i++) {
      const customer = await createTestCustomer(org.id, `cust_p_${i}@test.com`, { name: `Pager ${i}` });
      await createTestThread(org.id, customer.id, ChannelType.email);
    }

    const req = new Request('http://localhost:3000/api/threads?limit=2');
    const res = await GET(req);
    const body = await res.json() as { threads: unknown[]; nextCursor: string | null };

    expect(body.threads).toHaveLength(2);
    expect(body.nextCursor).not.toBeNull();
  });

  it('returns preview message when preview=true', async () => {
    const customer = await createTestCustomer(org.id, 'cust_preview', { name: 'Frank' });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const first = await createTestMessage(thread.id, 'First message');
    const note = await createTestMessage(thread.id, 'Internal note', SenderType.note);
    const second = await createTestMessage(thread.id, 'Second message');
    await db.message.update({ where: { id: first.id }, data: { sentAt: new Date('2024-01-01T00:00:00.000Z') } });
    await db.message.update({ where: { id: note.id }, data: { sentAt: new Date('2024-01-01T00:01:00.000Z') } });
    await db.message.update({ where: { id: second.id }, data: { sentAt: new Date('2024-01-01T00:02:00.000Z') } });

    const req = new Request('http://localhost:3000/api/threads?preview=true');
    const res = await GET(req);
    const body = await res.json() as { threads: { messages: { contentText: string | null }[] }[] };

    expect(body.threads[0].messages).toHaveLength(1);
    expect(body.threads[0].messages[0].contentText).toBe('Second message');
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockRejectedValueOnce(new Error('Unauthenticated'));

    const req = new Request('http://localhost:3000/api/threads');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('excludes filterStatus=filtered threads by default', async () => {
    const customer = await createTestCustomer(org.id, 'cust_genuine@test.com', { name: 'Gen' });
    await createTestThread(org.id, customer.id, ChannelType.email);
    const spammer = await createTestCustomer(org.id, 'spam@test.com', { name: 'Spam' });
    const spamThread = await createTestThread(org.id, spammer.id, ChannelType.email);
    await db.thread.update({ where: { id: spamThread.id }, data: { filterStatus: 'filtered' } });

    const req = new Request('http://localhost:3000/api/threads');
    const res = await GET(req);
    const body = await res.json() as { threads: { id: string }[] };

    expect(body.threads).toHaveLength(1);
    expect(body.threads[0].id).not.toBe(spamThread.id);
  });

  it('returns only filtered threads when ?filterStatus=filtered', async () => {
    const customer = await createTestCustomer(org.id, 'cust_genuine2@test.com', { name: 'Gen' });
    await createTestThread(org.id, customer.id, ChannelType.email);
    const spammer = await createTestCustomer(org.id, 'spam2@test.com', { name: 'Spam' });
    const spamThread = await createTestThread(org.id, spammer.id, ChannelType.email);
    await db.thread.update({ where: { id: spamThread.id }, data: { filterStatus: 'filtered' } });

    const req = new Request('http://localhost:3000/api/threads?filterStatus=filtered');
    const res = await GET(req);
    const body = await res.json() as { threads: { id: string }[] };

    expect(body.threads).toHaveLength(1);
    expect(body.threads[0].id).toBe(spamThread.id);
  });

  it('returns both open and closed filtered threads when ?filterStatus=filtered', async () => {
    const openSpammer = await createTestCustomer(org.id, 'open_spam@test.com', { name: 'OpenSpam' });
    const openSpam = await createTestThread(org.id, openSpammer.id, ChannelType.email);
    await db.thread.update({ where: { id: openSpam.id }, data: { filterStatus: 'filtered' } });

    const closedSpammer = await createTestCustomer(org.id, 'closed_spam@test.com', { name: 'ClosedSpam' });
    const closedSpam = await createTestThread(org.id, closedSpammer.id, ChannelType.email);
    await db.thread.update({ where: { id: closedSpam.id }, data: { filterStatus: 'filtered', status: 'closed' } });

    const req = new Request('http://localhost:3000/api/threads?status=open&filterStatus=filtered');
    const res = await GET(req);
    const body = await res.json() as { threads: { id: string }[] };

    expect(body.threads.map(t => t.id).sort()).toEqual([openSpam.id, closedSpam.id].sort());
  });

  it('returns only threads where the customer sent the last message when ?needsReply=true', async () => {
    const waiting = await createTestCustomer(org.id, 'waiting@test.com', { name: 'Waiting' });
    const waitingThread = await createTestThread(org.id, waiting.id, ChannelType.email);
    await createMessage({ threadId: waitingThread.id, contentText: 'help', senderType: SenderType.customer });

    const replied = await createTestCustomer(org.id, 'replied@test.com', { name: 'Replied' });
    const repliedThread = await createTestThread(org.id, replied.id, ChannelType.email);
    await createMessage({ threadId: repliedThread.id, contentText: 'hi', senderType: SenderType.customer });
    await createMessage({ threadId: repliedThread.id, contentText: 'on it', senderType: SenderType.agent });

    const req = new Request('http://localhost:3000/api/threads?needsReply=true');
    const res = await GET(req);
    const body = await res.json() as { threads: { id: string }[] };

    expect(body.threads.map(t => t.id)).toEqual([waitingThread.id]);
  });

  it('returns 403 when the user has no active organization', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: 'usr_test', orgId: null } as unknown as ReturnType<typeof auth> extends Promise<infer T>
        ? T
        : never
    );

    const req = new Request('http://localhost:3000/api/threads');
    const res = await GET(req);
    const body = await res.json() as { error: string };

    expect(res.status).toBe(403);
    expect(body.error).toBe('No active organization');
  });
});
