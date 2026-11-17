import { randomUUID } from 'node:crypto';
import type { Job } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';
import { handleShopifyJob } from './channels.js';
import type { InboundJobData, ShopifyOrderPayload } from '../../types.js';

let org: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

function job(topic: string, payload: Partial<ShopifyOrderPayload> = {}): Job<InboundJobData> {
  return {
    data: {
      platform: 'shopify',
      organizationId: org.id,
      topic,
      traceId: `trace-${randomUUID()}`,
      rawPayload: {
        id: Number(String(Date.now()).slice(-9)),
        order_number: 1024,
        name: '#1024',
        total_price: '41.99',
        currency: 'USD',
        created_at: new Date().toISOString(),
        email: 'shopper@example.com',
        line_items: [{ product_id: 111 }],
        customer: { id: 42, email: 'shopper@example.com', first_name: 'Ada' },
        ...payload,
      },
    },
  } as unknown as Job<InboundJobData>;
}

const rows = () => db.conversationAttribution.findMany({ where: { organizationId: org.id } });

describe('handleShopifyJob attribution hook', () => {
  it('records revenue for a new order', async () => {
    await handleShopifyJob(job('orders/create'));

    const recorded = await rows();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ kind: 'direct', orderTotalCents: 4199, orderName: '#1024' });
  });

  it.each(['orders/updated', 'orders/fulfilled', 'orders/cancelled'])(
    'does not double-count revenue on %s',
    async (topic) => {
      await handleShopifyJob(job(topic));

      // These topics restate an order that orders/create already counted. Shopify
      // fires orders/updated on creation too, often twice as payment settles, so
      // counting them would inflate every merchant's revenue.
      expect(await rows()).toHaveLength(0);
    },
  );

  it('still records a guest order that carries no customer identity', async () => {
    // Nobody to match a conversation to, but it is real revenue, and the
    // attributed share is only meaningful against every order.
    await handleShopifyJob(job('orders/create', { customer: undefined, email: undefined }));

    const recorded = await rows();
    expect(recorded).toHaveLength(1);
    expect(recorded[0].kind).toBe('direct');
  });

  it('records nothing for an order it cannot parse, without failing the job', async () => {
    await expect(
      handleShopifyJob(job('orders/create', { total_price: undefined })),
    ).resolves.toBeUndefined();

    expect(await rows()).toHaveLength(0);
  });

  it('does not credit an order to the thread an earlier order event left', async () => {
    // Order webhooks used to open a note-only `shopify` thread per customer, so a
    // repeat buyer's next order matched it and the briefing reported them as
    // someone who had talked to the agent first.
    const customer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'shopper@example.com' },
    });
    await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: 'shopify',
        status: 'closed',
        tag: 'Order Status',
        createdAt: new Date(Date.now() - 2 * 86_400_000),
      },
    });

    await handleShopifyJob(job('orders/create'));

    const recorded = await rows();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ kind: 'direct', matchBasis: 'none', threadId: null });
  });
});
