import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { GET, PATCH } from './route';
import { auth } from '@clerk/nextjs/server';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

const makeReq = (id: string, body: unknown) =>
  new Request(`http://localhost:3000/api/threads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const makeRawReq = (id: string, body: string) =>
  new Request(`http://localhost:3000/api/threads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

const callPatch = (id: string, body: unknown) =>
  PATCH(makeReq(id, body), { params: Promise.resolve({ id }) });

const callGet = (id: string) =>
  GET(new Request(`http://localhost:3000/api/threads/${id}`), { params: Promise.resolve({ id }) });

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({ userId: 'usr_test', orgId: org.clerkOrgId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe('GET /api/threads/[id]', () => {
  it('returns a full thread with ordered messages', async () => {
    const customer = await createTestCustomer(org.id, 'thread_detail@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const first = await createTestMessage(thread.id, 'First message');
    const second = await createTestMessage(thread.id, 'Second message');
    await db.message.update({ where: { id: first.id }, data: { sentAt: new Date('2024-01-01T00:00:00.000Z') } });
    await db.message.update({ where: { id: second.id }, data: { sentAt: new Date('2024-01-01T00:01:00.000Z') } });

    const res = await callGet(thread.id);
    const body = await res.json() as { thread: { id: string; messages: { contentText: string | null }[] } };

    expect(res.status).toBe(200);
    expect(body.thread.id).toBe(thread.id);
    expect(body.thread.messages.map(message => message.contentText)).toEqual(['First message', 'Second message']);
  });

  it('returns 404 for another org thread', async () => {
    const otherOrg = await createTestOrg();
    try {
      const customer = await createTestCustomer(otherOrg.id, 'other_detail@test.com');
      const thread = await createTestThread(otherOrg.id, customer.id, ChannelType.email);

      const res = await callGet(thread.id);
      expect(res.status).toBe(404);
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });

  it('returns 404 for archived threads', async () => {
    const customer = await createTestCustomer(org.id, 'archived_detail@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { archivedAt: new Date() } });

    const res = await callGet(thread.id);
    expect(res.status).toBe(404);
  });

  it('returns 404 for deleted threads', async () => {
    const customer = await createTestCustomer(org.id, 'deleted_detail@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { deletedAt: new Date() } });

    const res = await callGet(thread.id);
    expect(res.status).toBe(404);
  });

  it('returns 404 for operator channel threads', async () => {
    const customer = await createTestCustomer(org.id, 'operator_detail@test.com');
    const thread = await db.thread.create({
      data: { organizationId: org.id, customerId: customer.id, channelType: ChannelType.sms_agent, status: 'open' },
    });

    const res = await callGet(thread.id);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/threads/[id]', () => {
  it('writes filterStatus=filtered + filterFeedback=confirmed_spam on mark as spam', async () => {
    const customer = await createTestCustomer(org.id, 'spam_target@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const res = await callPatch(thread.id, { filterStatus: 'filtered', filterFeedback: 'confirmed_spam' });
    expect(res.status).toBe(200);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.filterStatus).toBe('filtered');
    expect(updated?.filterFeedback).toBe('confirmed_spam');
  });

  it('writes filterStatus=genuine + filterFeedback=confirmed_genuine on recover', async () => {
    const customer = await createTestCustomer(org.id, 'recover_target@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { filterStatus: 'filtered' } });

    const res = await callPatch(thread.id, { filterStatus: 'genuine', filterFeedback: 'confirmed_genuine' });
    expect(res.status).toBe(200);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.filterStatus).toBe('genuine');
    expect(updated?.filterFeedback).toBe('confirmed_genuine');
  });

  // Recovery is one of the two ordinary merchant actions that leave a thread
  // genuine, open, holding a pending customer message, with no plan and nothing
  // that will ever make one — reopening a closed thread is the other, and it
  // clears cachedPlan on the way through. Plan generation only ever runs off an
  // inbound message (ai-summary-flow → generateThreadPlan), and the classifier
  // will not revisit its verdict because filterDecidedAt is a one-shot lock.
  //
  // That combination is the `blocked_no_plan` state. The product answer is to
  // name it in the briefing as a handoff, not to re-plan on a dashboard write,
  // so this pins the state the PATCH leaves behind rather than asserting a plan
  // appears.
  it('leaves a recovered thread blocked with no plan for the message it is holding', async () => {
    const customer = await createTestCustomer(org.id, 'recover_replan@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const pending = await createTestMessage(thread.id, 'Where is my order? It has been two weeks.');
    await db.thread.update({
      where: { id: thread.id },
      data: { filterStatus: 'questionable', filterDecidedAt: new Date() },
    });

    const res = await callPatch(thread.id, { filterStatus: 'genuine', filterFeedback: 'confirmed_genuine' });
    expect(res.status).toBe(200);

    const updated = await db.thread.findUnique({
      where: { id: thread.id },
      include: {
        messages: {
          where: { deletedAt: null, senderType: { not: 'note' } },
          orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
    });
    expect(updated?.filterStatus).toBe('genuine');
    expect(updated?.status).toBe('open');
    // The three facts that derive `blocked_no_plan`: open, a customer with the
    // last word, and no cached plan for that message.
    expect(updated?.messages[0]?.id).toBe(pending.id);
    expect(updated?.messages[0]?.senderType).toBe('customer');
    expect(updated?.cachedPlan).toBeNull();
  });

  it('writes confirmed_genuine when closing a questionable thread (implicit feedback)', async () => {
    const customer = await createTestCustomer(org.id, 'close_questionable@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { filterStatus: 'questionable' } });

    const res = await callPatch(thread.id, { status: 'closed' });
    expect(res.status).toBe(200);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.status).toBe('closed');
    expect(updated?.filterFeedback).toBe('confirmed_genuine');
  });

  it('does not write implicit feedback when closing a genuine thread', async () => {
    const customer = await createTestCustomer(org.id, 'close_genuine@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const res = await callPatch(thread.id, { status: 'closed' });
    expect(res.status).toBe(200);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.status).toBe('closed');
    expect(updated?.filterFeedback).toBe('none');
  });

  it('rejects an invalid filterStatus value', async () => {
    const customer = await createTestCustomer(org.id, 'invalid@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const res = await callPatch(thread.id, { filterStatus: 'totally-bogus' });
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON without updating the thread', async () => {
    const customer = await createTestCustomer(org.id, 'malformed@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const res = await PATCH(makeRawReq(thread.id, '{'), { params: Promise.resolve({ id: thread.id }) });

    expect(res.status).toBe(400);
    const unchanged = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(unchanged.status).toBe('open');
  });

  it('rejects unknown patch fields', async () => {
    const customer = await createTestCustomer(org.id, 'unknown_field@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const res = await callPatch(thread.id, { status: 'open', surprise: true });

    expect(res.status).toBe(400);
  });

  it('returns 404 when the thread belongs to another org', async () => {
    const otherOrg = await createTestOrg();
    try {
      const customer = await createTestCustomer(otherOrg.id, 'other@test.com');
      const thread = await createTestThread(otherOrg.id, customer.id, ChannelType.email);

      const res = await callPatch(thread.id, { filterStatus: 'filtered', filterFeedback: 'confirmed_spam' });
      expect(res.status).toBe(404);
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });
});
