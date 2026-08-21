import { randomUUID } from 'node:crypto';
import type { Job, Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { cleanupTestData, createTestOrg } from '@shopkeeper/db/test-helpers';
import { handleShopifyJob } from './channels.js';
import type { InboundJobData, ShopifyOrderPayload } from '../types.js';

const aiSummaryQueue = { add: vi.fn().mockResolvedValue({ id: 'summary-job' }) } as unknown as Queue;

let org: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  vi.clearAllMocks();
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
      inboundMessageId: `shopify:test:${randomUUID()}`,
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
    await handleShopifyJob(job('orders/create'), aiSummaryQueue);

    const recorded = await rows();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ kind: 'direct', orderTotalCents: 4199, orderName: '#1024' });
  });

  it.each(['orders/updated', 'orders/fulfilled', 'orders/cancelled'])(
    'does not double-count revenue on %s',
    async (topic) => {
      await handleShopifyJob(job(topic), aiSummaryQueue);

      // These topics restate an order that orders/create already counted. Shopify
      // fires orders/updated on creation too, often twice as payment settles, so
      // counting them would inflate every merchant's revenue.
      expect(await rows()).toHaveLength(0);
    },
  );

  it('still records a guest order that carries no customer identity', async () => {
    // This order is dropped for messaging — there is nobody to open a thread
    // for — but it is real revenue, and the attributed share is only meaningful
    // against a complete denominator. Hence the hook sits above that guard.
    await handleShopifyJob(
      job('orders/create', { customer: undefined, email: undefined }),
      aiSummaryQueue,
    );

    const recorded = await rows();
    expect(recorded).toHaveLength(1);
    expect(recorded[0].kind).toBe('direct');
  });

  it('does not let an unparseable order stop the order event itself', async () => {
    await expect(
      handleShopifyJob(job('orders/create', { total_price: undefined }), aiSummaryQueue),
    ).resolves.toBeUndefined();

    expect(await rows()).toHaveLength(0);
    // The message still landed, which is the part the merchant sees.
    const messages = await db.message.count({
      where: { thread: { organizationId: org.id } },
    });
    expect(messages).toBe(1);
  });
});
