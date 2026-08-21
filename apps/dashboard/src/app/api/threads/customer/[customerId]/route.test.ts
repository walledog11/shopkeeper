import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, SenderType, db, type DbChannelType } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));

import { GET } from './route';

type ThreadRow = {
  id: string;
  channelType: string;
  messages: { id: string; senderType: string; contentText: string }[];
};

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;
let otherOrg: Awaited<ReturnType<typeof createTestOrg>> | null = null;

const call = (customerId: string, query = '') =>
  GET(
    new Request(`http://localhost/api/threads/customer/${customerId}${query}`),
    { params: Promise.resolve({ customerId }) },
  );

const readThreads = async (response: Response) => {
  const body = (await response.json()) as { threads: ThreadRow[] };
  return body.threads;
};

// `threads_one_open_per_customer` is a partial unique index on
// (organization_id, customer_id, channel_type) WHERE status = 'open', so a
// customer can hold only one *open* thread per channel. It lives in the
// migration only — schema.prisma does not declare it — so it surfaces as a
// runtime P2002 rather than a type error. Closed threads are unconstrained,
// which is what the multi-thread cases below use.
const createClosedThread = (customerId: string, channel: DbChannelType = ChannelType.email) =>
  db.thread.create({
    data: {
      organizationId: org!.id,
      customerId,
      channelType: channel,
      status: 'closed',
      tag: 'Support',
    },
  });

beforeEach(async () => {
  org = await createTestOrg();
  otherOrg = await createTestOrg();
  mockAuth.mockResolvedValue({ userId: 'usr_customer_threads', orgId: org.clerkOrgId });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
  org = null;
  otherOrg = null;
  vi.clearAllMocks();
});

describe('GET /api/threads/customer/[customerId]', () => {
  it("returns the customer's support threads with their latest message", async () => {
    const customer = await createTestCustomer(org!.id, 'shopper@example.com');
    const thread = await createTestThread(org!.id, customer.id, ChannelType.email);
    await createTestMessage(thread.id, 'First message');
    await createTestMessage(thread.id, 'Most recent message');

    const threads = await readThreads(await call(customer.id));

    expect(threads).toHaveLength(1);
    expect(threads[0].id).toBe(thread.id);
    expect(threads[0].messages).toHaveLength(1);
    expect(threads[0].messages[0].contentText).toBe('Most recent message');
  });

  it("never returns another org's threads for that org's customer id", async () => {
    const foreignCustomer = await createTestCustomer(otherOrg!.id, 'foreign@example.com');
    const foreignThread = await createTestThread(
      otherOrg!.id,
      foreignCustomer.id,
      ChannelType.email,
    );
    await createTestMessage(foreignThread.id, 'Confidential to the other org');

    // The caller supplies the id, so this is the tenant boundary for the route:
    // a real id from a real customer, just not one of theirs.
    const threads = await readThreads(await call(foreignCustomer.id));

    expect(threads).toEqual([]);
  });

  it('excludes operator channels, which are merchant-side and not customer history', async () => {
    const customer = await createTestCustomer(org!.id, 'shopper2@example.com');
    const support = await createTestThread(org!.id, customer.id, ChannelType.email);
    await createTestThread(org!.id, customer.id, ChannelType.sms_agent);
    await createTestThread(org!.id, customer.id, ChannelType.dashboard_agent);

    const threads = await readThreads(await call(customer.id));

    // sms_agent and dashboard_agent carry the merchant's own conversations with
    // the agent. Surfacing them as customer history would show the merchant's
    // private operator turns on a customer record.
    expect(threads.map(t => t.id)).toEqual([support.id]);
  });

  it('excludes archived and soft-deleted threads', async () => {
    const customer = await createTestCustomer(org!.id, 'shopper3@example.com');
    const visible = await createTestThread(org!.id, customer.id, ChannelType.email);
    const archived = await createClosedThread(customer.id, ChannelType.ig_dm);
    const deleted = await createClosedThread(customer.id, ChannelType.shopify_chat);

    await db.thread.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    await db.thread.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    const threads = await readThreads(await call(customer.id));

    expect(threads.map(t => t.id)).toEqual([visible.id]);
  });

  it('omits internal notes when choosing the latest message', async () => {
    const customer = await createTestCustomer(org!.id, 'shopper4@example.com');
    const thread = await createTestThread(org!.id, customer.id, ChannelType.email);
    await createTestMessage(thread.id, 'Customer asked about delivery');
    await createTestMessage(thread.id, '__shopkeeper_agent__ internal reasoning', SenderType.note);

    const threads = await readThreads(await call(customer.id));

    // Notes hold agent turn transcripts. The preview here is customer-facing
    // history, so a note must not become the visible last line.
    expect(threads[0].messages).toHaveLength(1);
    expect(threads[0].messages[0].contentText).toBe('Customer asked about delivery');
  });

  it('caps an oversized limit at 25 rather than honouring it', async () => {
    const customer = await createTestCustomer(org!.id, 'shopper5@example.com');
    for (let i = 0; i < 27; i += 1) {
      await createClosedThread(customer.id);
    }

    const threads = await readThreads(await call(customer.id, '?limit=500'));

    expect(threads).toHaveLength(25);
  });

  it('ignores a non-numeric or non-positive limit instead of returning nothing', async () => {
    const customer = await createTestCustomer(org!.id, 'shopper6@example.com');
    await createClosedThread(customer.id);
    await createClosedThread(customer.id);

    for (const bad of ['?limit=abc', '?limit=0', '?limit=-3', '?limit=2.5']) {
      const threads = await readThreads(await call(customer.id, bad));
      expect(threads).toHaveLength(2);
    }
  });

  it('honours a valid limit below the cap', async () => {
    const customer = await createTestCustomer(org!.id, 'shopper7@example.com');
    await createClosedThread(customer.id);
    await createClosedThread(customer.id);
    await createClosedThread(customer.id);

    const threads = await readThreads(await call(customer.id, '?limit=2'));

    expect(threads).toHaveLength(2);
  });

  it('returns an empty list for a well-formed customer id with no threads', async () => {
    const customer = await createTestCustomer(org!.id, 'shopper8@example.com');

    const threads = await readThreads(await call(customer.id));

    expect(threads).toEqual([]);
  });

  it('404s a malformed customer id instead of 500ing on it', async () => {
    // `customer_id` is @db.Uuid, so a non-UUID reaches Postgres as
    // `Inconsistent column data` and handleApiError turns it into a 500 —
    // making a client-side typo indistinguishable from a server fault.
    for (const malformed of ['garbage', '123', 'not-a-uuid', `${'a'.repeat(36)}`]) {
      const response = await call(malformed);
      expect(response.status).toBe(404);
    }
  });
});
