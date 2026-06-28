import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), clerkClient: vi.fn() }));

import { auth } from '@clerk/nextjs/server';
import { PATCH } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>>;
let otherOrg: Awaited<ReturnType<typeof createTestOrg>> | null;

function request(body: unknown) {
  return new Request('http://localhost/api/threads/bulk', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  org = await createTestOrg();
  otherOrg = null;
  vi.mocked(auth).mockResolvedValue({ userId: 'user-1', orgId: org.clerkOrgId } as never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
  vi.clearAllMocks();
});

describe('PATCH /api/threads/bulk', () => {
  it.each([
    ['close', { status: 'closed' }],
    ['open', { status: 'open' }],
    ['tag', { tag: 'Returns' }],
    ['archive', { archivedAt: expect.any(Date) }],
  ] as const)('applies the %s action to verified org threads', async (action, expected) => {
    const customer = await createTestCustomer(org.id, `${action}@example.com`);
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    if (action === 'open') {
      await db.thread.update({ where: { id: thread.id }, data: { status: 'closed' } });
    }

    const response = await PATCH(request({
      ids: [thread.id],
      action,
      ...(action === 'tag' ? { tag: 'Returns' } : {}),
    }));

    expect(response.status).toBe(200);
    await expect(db.thread.findUnique({ where: { id: thread.id } })).resolves.toMatchObject(expected);
  });

  it('ignores cross-organization ids and never mutates them', async () => {
    otherOrg = await createTestOrg();
    const ownCustomer = await createTestCustomer(org.id, 'own@example.com');
    const otherCustomer = await createTestCustomer(otherOrg.id, 'other@example.com');
    const ownThread = await createTestThread(org.id, ownCustomer.id, ChannelType.email);
    const otherThread = await createTestThread(otherOrg.id, otherCustomer.id, ChannelType.email);

    const response = await PATCH(request({
      ids: [ownThread.id, otherThread.id],
      action: 'close',
    }));

    expect(await response.json()).toEqual({ updated: 1 });
    await expect(db.thread.findUnique({ where: { id: otherThread.id } })).resolves.toMatchObject({
      status: 'open',
    });
  });

  it('returns 404 without writes when none of the ids belong to the org', async () => {
    otherOrg = await createTestOrg();
    const customer = await createTestCustomer(otherOrg.id, 'none@example.com');
    const thread = await createTestThread(otherOrg.id, customer.id, ChannelType.email);

    const response = await PATCH(request({ ids: [thread.id], action: 'close' }));

    expect(response.status).toBe(404);
    await expect(db.thread.findUnique({ where: { id: thread.id } })).resolves.toMatchObject({
      status: 'open',
    });
  });
});
