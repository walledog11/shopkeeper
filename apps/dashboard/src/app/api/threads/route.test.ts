import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, db } from '@clerk/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from '@clerk/db/test-helpers';

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
    await createTestMessage(thread.id, 'First message');
    await createTestMessage(thread.id, 'Second message');

    const req = new Request('http://localhost:3000/api/threads?preview=true');
    const res = await GET(req);
    const body = await res.json() as { threads: { messages: unknown[] }[] };

    expect(body.threads[0].messages).toHaveLength(1);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockRejectedValueOnce(new Error('Unauthenticated'));

    const req = new Request('http://localhost:3000/api/threads');
    const res = await GET(req);

    expect(res.status).toBe(401);
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
