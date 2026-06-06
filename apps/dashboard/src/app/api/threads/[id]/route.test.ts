import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, db } from '@clerk/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@clerk/db/test-helpers';

const { mockEnqueueCustomerMemory } = vi.hoisted(() => ({
  mockEnqueueCustomerMemory: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/server/customer-memory', () => ({
  enqueueCustomerMemoryForClosedThreads: mockEnqueueCustomerMemory,
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

  it('writes confirmed_genuine when closing a questionable thread (implicit feedback)', async () => {
    const customer = await createTestCustomer(org.id, 'close_questionable@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { filterStatus: 'questionable' } });

    const res = await callPatch(thread.id, { status: 'closed' });
    expect(res.status).toBe(200);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.status).toBe('closed');
    expect(updated?.filterFeedback).toBe('confirmed_genuine');
    expect(mockEnqueueCustomerMemory).toHaveBeenCalledWith({
      organizationId: org.id,
      threads: [{ threadId: thread.id, closedAt: expect.any(Date) }],
    });
  });

  it('does not write implicit feedback when closing a genuine thread', async () => {
    const customer = await createTestCustomer(org.id, 'close_genuine@test.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const res = await callPatch(thread.id, { status: 'closed' });
    expect(res.status).toBe(200);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.status).toBe('closed');
    expect(updated?.filterFeedback).toBe('none');
    expect(mockEnqueueCustomerMemory).toHaveBeenCalledWith({
      organizationId: org.id,
      threads: [{ threadId: thread.id, closedAt: expect.any(Date) }],
    });
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
