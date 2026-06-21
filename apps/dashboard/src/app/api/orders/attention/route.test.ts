import { randomUUID } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestCustomer, createTestOrg, createTestThread } from '@shopkeeper/db/test-helpers';
import type { OrderAttentionFinding, OrderAttentionReturn } from './route';

type OrderAttentionResponse = { findings: OrderAttentionFinding[]; returns: OrderAttentionReturn[] };

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { GET } from './route';

let org: Awaited<ReturnType<typeof createTestOrg>>;
let otherOrg: Awaited<ReturnType<typeof createTestOrg>> | null = null;

function seedShopify(orgId: string, connectedAt: Date) {
  return db.integration.create({
    data: {
      organizationId: orgId,
      platform: 'shopify',
      externalAccountId: `store-${randomUUID()}.myshopify.com`,
      accessToken: 'token',
      createdAt: connectedAt,
    },
  });
}

function seedFlagOrder(orgId: string, orderId: string, name: string, reason: string, executedAt: Date) {
  return db.agentAction.create({
    data: {
      turnId: randomUUID(),
      organizationId: orgId,
      tool: 'flag_order',
      category: 'action',
      input: { reason },
      status: 'success',
      mode: 'auto_executed',
      durationMs: 12,
      instruction: `order-risk-review:${orderId}`,
      summary: `Flagged order ${name} for review: ${reason}`,
      executedAt,
    },
  });
}

async function getAttention(): Promise<OrderAttentionResponse> {
  const res = await GET(new Request('http://localhost/api/orders/attention'));
  expect(res.status).toBe(200);
  return (await res.json()) as OrderAttentionResponse;
}

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: 'usr_attention',
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  await cleanupTestData(otherOrg?.id);
  otherOrg = null;
  vi.clearAllMocks();
});

describe('GET /api/orders/attention', () => {
  it('returns findings from the current store connection and open Returns threads', async () => {
    await seedShopify(org.id, new Date('2026-06-01T00:00:00.000Z'));
    await seedFlagOrder(org.id, '9001', '#1001', 'High-risk shipping address', new Date('2026-06-10T00:00:00.000Z'));
    const customer = await createTestCustomer(org.id, 'buyer@example.com', { name: 'Jane Doe' });
    await createTestThread(org.id, customer.id, 'email', { tag: 'Returns' });
    // A non-Returns thread must not appear in the returns bucket.
    const otherCustomer = await createTestCustomer(org.id, 'support@example.com', { name: 'Sam Support' });
    await createTestThread(org.id, otherCustomer.id, 'email', { tag: 'Support' });

    const body = await getAttention();

    expect(body.findings).toEqual([
      expect.objectContaining({ orderId: '9001', orderName: '#1001', reason: 'High-risk shipping address' }),
    ]);
    expect(body.returns).toEqual([expect.objectContaining({ customerName: 'Jane Doe', summary: null })]);
  });

  it('excludes findings generated before the current store was connected', async () => {
    // Mirrors a Shopify reinstall: the store reconnects, wiping the order the
    // earlier finding referenced. The stale finding must not surface.
    await seedShopify(org.id, new Date('2026-06-15T00:00:00.000Z'));
    await seedFlagOrder(org.id, '7317445509440', '#PG1013', 'Random-looking email', new Date('2026-06-09T00:00:00.000Z'));
    const customer = await createTestCustomer(org.id, 'buyer@example.com', { name: 'Jane Doe' });
    await createTestThread(org.id, customer.id, 'email', { tag: 'Returns' });

    const body = await getAttention();

    expect(body.findings).toEqual([]);
    expect(body.returns).toHaveLength(1);
  });

  it('returns no findings when no Shopify store is connected', async () => {
    await seedFlagOrder(org.id, '9001', '#1001', 'risk', new Date());

    const body = await getAttention();

    expect(body.findings).toEqual([]);
  });

  it('does not leak another org findings or returns', async () => {
    otherOrg = await createTestOrg();
    await seedShopify(otherOrg.id, new Date('2026-06-01T00:00:00.000Z'));
    await seedFlagOrder(otherOrg.id, '8001', '#8001', 'foreign risk', new Date('2026-06-10T00:00:00.000Z'));
    const foreignCustomer = await createTestCustomer(otherOrg.id, 'foreign@example.com', { name: 'Foreign' });
    await createTestThread(otherOrg.id, foreignCustomer.id, 'email', { tag: 'Returns' });

    const body = await getAttention();

    expect(body.findings).toEqual([]);
    expect(body.returns).toEqual([]);
  });
});
