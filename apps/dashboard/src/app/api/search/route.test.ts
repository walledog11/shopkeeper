import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), clerkClient: vi.fn() }));

import { auth } from '@clerk/nextjs/server';
import { GET } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>>;
let otherOrg: Awaited<ReturnType<typeof createTestOrg>> | null;

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

describe('GET /api/search', () => {
  it('validates the query before accessing data', async () => {
    const response = await GET(new Request('http://localhost/api/search?q=x'));

    expect(response.status).toBe(400);
  });

  it('searches customer, summary, tag, and message text within the active org', async () => {
    const customer = await createTestCustomer(org.id, 'buyer@example.com', { name: 'Alex Canvas' });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email, { tag: 'Shipping' });
    await createTestMessage(thread.id, 'The blue canvas bag is delayed');
    await db.thread.update({
      where: { id: thread.id },
      data: { aiSummary: 'Canvas order delay' },
    });
    otherOrg = await createTestOrg();
    const otherCustomer = await createTestCustomer(otherOrg.id, 'secret@example.com', { name: 'Canvas Secret' });
    await createTestThread(otherOrg.id, otherCustomer.id, ChannelType.email);

    const response = await GET(new Request('http://localhost/api/search?q=canvas'));
    const body = await response.json() as { threads: Array<{ id: string }> };

    expect(body.threads.map((result) => result.id)).toEqual([thread.id]);
  });

  it('excludes archived, deleted, and operator-channel threads', async () => {
    const customer = await createTestCustomer(org.id, 'hidden@example.com', { name: 'Hidden Canvas' });
    const archived = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: ChannelType.dashboard_agent,
        aiSummary: 'Canvas internal session',
      },
    });

    const response = await GET(new Request('http://localhost/api/search?q=canvas'));
    const body = await response.json() as { threads: unknown[] };

    expect(body.threads).toEqual([]);
  });
});
