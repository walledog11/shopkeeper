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

  it('returns for-me threads when the customer is waiting or a draft is ready', async () => {
    const waiting = await createTestCustomer(org.id, 'for_me_waiting@test.com', { name: 'ForMeWaiting' });
    const waitingThread = await createTestThread(org.id, waiting.id, ChannelType.email);
    await createMessage({ threadId: waitingThread.id, contentText: 'help', senderType: SenderType.customer });

    const replied = await createTestCustomer(org.id, 'for_me_replied@test.com', { name: 'ForMeReplied' });
    const repliedThread = await createTestThread(org.id, replied.id, ChannelType.email);
    await createMessage({ threadId: repliedThread.id, contentText: 'hi', senderType: SenderType.customer });
    await createMessage({ threadId: repliedThread.id, contentText: 'on it', senderType: SenderType.agent });

    const req = new Request('http://localhost:3000/api/threads?forMe=true');
    const res = await GET(req);
    const body = await res.json() as { threads: { id: string }[] };

    expect(body.threads.map(t => t.id)).toEqual([waitingThread.id]);
  });

  it('filters open threads by tag when ?tag=Returns', async () => {
    const returnsCustomer = await createTestCustomer(org.id, 'returns@test.com', { name: 'Returns' });
    const returnsThread = await createTestThread(org.id, returnsCustomer.id, ChannelType.email);
    await db.thread.update({ where: { id: returnsThread.id }, data: { tag: 'Returns' } });

    const otherCustomer = await createTestCustomer(org.id, 'shipping@test.com', { name: 'Shipping' });
    const otherThread = await createTestThread(org.id, otherCustomer.id, ChannelType.email);
    await db.thread.update({ where: { id: otherThread.id }, data: { tag: 'Shipping' } });

    const req = new Request('http://localhost:3000/api/threads?tag=Returns');
    const res = await GET(req);
    const body = await res.json() as { threads: { id: string }[] };

    expect(body.threads.map(t => t.id)).toEqual([returnsThread.id]);
  });

  async function collectAllPages(queryString: string): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const url = `http://localhost:3000/api/threads?${queryString}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res = await GET(new Request(url));
      const body = await res.json() as { threads: { id: string }[]; nextCursor: string | null };
      ids.push(...body.threads.map(t => t.id));
      if (!body.nextCursor) break;
      cursor = body.nextCursor;
    }
    return ids;
  }

  it('paginates in last_message_at order without skipping rows when UUID order disagrees', async () => {
    const threadIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const customer = await createTestCustomer(org.id, `paginate_${i}@test.com`, { name: `Pag ${i}` });
      const thread = await createTestThread(org.id, customer.id, ChannelType.email);
      threadIds.push(thread.id);
    }
    // Assign last_message_at in the reverse of id order: smallest id = newest, so
    // the (last_message_at DESC, id DESC) order is exactly the ascending-id order
    // — the case where the old `id < cursor` cursor skipped rows.
    const byIdAsc = [...threadIds].sort();
    const base = Date.parse('2026-01-01T00:00:00.000Z');
    await Promise.all(byIdAsc.map((id, index) =>
      db.thread.update({
        where: { id },
        data: { lastMessageAt: new Date(base + (byIdAsc.length - index) * 60_000) },
      }),
    ));

    const paged = await collectAllPages('status=open&limit=1');

    expect(paged).toEqual(byIdAsc);
  });

  it('paginates SQL-filtered lists in last_message_at order without skipping rows', async () => {
    const threadIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const customer = await createTestCustomer(org.id, `sqlpage_${i}@test.com`, { name: `SqlPag ${i}` });
      const thread = await createTestThread(org.id, customer.id, ChannelType.email);
      threadIds.push(thread.id);
    }
    const byIdAsc = [...threadIds].sort();
    const base = Date.parse('2026-02-01T00:00:00.000Z');
    await Promise.all(byIdAsc.map((id, index) =>
      db.thread.update({
        where: { id },
        data: { tag: 'Returns', lastMessageAt: new Date(base + (byIdAsc.length - index) * 60_000) },
      }),
    ));

    const paged = await collectAllPages('tag=Returns&status=open&limit=1');

    expect(paged).toEqual(byIdAsc);
  });

  it('paginates SQL-filtered lists across a sub-millisecond boundary', async () => {
    const a = await createTestCustomer(org.id, 'us_a@test.com', { name: 'UsA' });
    const threadA = await createTestThread(org.id, a.id, ChannelType.email);
    const b = await createTestCustomer(org.id, 'us_b@test.com', { name: 'UsB' });
    const threadB = await createTestThread(org.id, b.id, ChannelType.email);
    // Same millisecond, one microsecond apart: B is newer. A ms-precision cursor
    // would round B down and skip A on the next page.
    await db.$executeRaw`UPDATE threads SET tag = 'Returns', last_message_at = '2026-03-01T00:00:00.123456Z'::timestamptz WHERE id = ${threadA.id}::uuid`;
    await db.$executeRaw`UPDATE threads SET tag = 'Returns', last_message_at = '2026-03-01T00:00:00.123457Z'::timestamptz WHERE id = ${threadB.id}::uuid`;

    const paged = await collectAllPages('tag=Returns&status=open&limit=1');

    expect(paged).toEqual([threadB.id, threadA.id]);
  });

  it('paginates the default inbox across a sub-millisecond boundary', async () => {
    const a = await createTestCustomer(org.id, 'default_us_a@test.com', { name: 'DefUsA' });
    const threadA = await createTestThread(org.id, a.id, ChannelType.email);
    const b = await createTestCustomer(org.id, 'default_us_b@test.com', { name: 'DefUsB' });
    const threadB = await createTestThread(org.id, b.id, ChannelType.email);
    await db.$executeRaw`UPDATE threads SET last_message_at = '2026-04-01T00:00:00.123456Z'::timestamptz WHERE id = ${threadA.id}::uuid`;
    await db.$executeRaw`UPDATE threads SET last_message_at = '2026-04-01T00:00:00.123457Z'::timestamptz WHERE id = ${threadB.id}::uuid`;

    const paged = await collectAllPages('status=open&limit=1');

    expect(paged).toEqual([threadB.id, threadA.id]);
  });

  it('returns 400 for a malformed cursor', async () => {
    const req = new Request('http://localhost:3000/api/threads?cursor=not-a-valid-cursor');
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it.each([
    ['status', 'not-a-status'],
    ['channelType', 'not-a-channel'],
    ['limit', '25rows'],
    ['preview', 'yes'],
  ])('returns 400 for invalid %s query input', async (field, value) => {
    const req = new Request(`http://localhost:3000/api/threads?${field}=${value}`);
    const res = await GET(req);
    const body = await res.json() as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/^Invalid |^limit must/);
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
