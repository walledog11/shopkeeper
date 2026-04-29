import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, db } from '@clerk/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from '@clerk/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { PATCH } from './route';
import { auth } from '@clerk/nextjs/server';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

const makeReq = (id: string, body: unknown) =>
  new Request(`http://localhost:3000/api/threads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const callPatch = (id: string, body: unknown) =>
  PATCH(makeReq(id, body), { params: Promise.resolve({ id }) });

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({ userId: 'usr_test', orgId: org.clerkOrgId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
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
