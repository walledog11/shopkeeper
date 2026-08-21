import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { hashVerifiedEmail } from '@shopkeeper/agent/storefront-verification';
import {
  ATTRIBUTION_LOOKBACK_DAYS,
  parseAttributionOrder,
  productIdsFromToolOutput,
  recordConversationAttribution,
  toMinorUnits,
} from './conversation-attribution.js';
import type { ShopifyOrderPayload } from '../types.js';

const SHOPPER = 'shopper@example.com';
// Relative to now, because the threads these tests create are stamped `now` and
// a conversation only counts if it precedes the order.
const ORDERED_AT = new Date(Date.now() + 60_000);

let org: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

function orderPayload(overrides: Partial<ShopifyOrderPayload> = {}): ShopifyOrderPayload {
  return {
    id: 5678901234,
    order_number: 1024,
    name: '#1024',
    total_price: '41.99',
    currency: 'USD',
    created_at: ORDERED_AT.toISOString(),
    email: SHOPPER,
    line_items: [{ product_id: 111 }, { product_id: 222 }],
    customer: { id: 42, email: SHOPPER },
    ...overrides,
  };
}

const orderFrom = (overrides: Partial<ShopifyOrderPayload> = {}) =>
  parseAttributionOrder(orderPayload(overrides))!;

async function threadFor(email: string, options: { createdAt?: Date } = {}) {
  const customer = await createTestCustomer(org.id, email);
  const thread = await createTestThread(org.id, customer.id, ChannelType.email);
  const createdAt = options.createdAt ?? new Date(ORDERED_AT.getTime() - 3_600_000);
  await db.thread.update({
    where: { id: thread.id },
    data: { createdAt, lastMessageAt: createdAt },
  });
  return { customer, thread };
}

async function readRow() {
  return db.conversationAttribution.findFirstOrThrow({ where: { organizationId: org.id } });
}

describe('toMinorUnits', () => {
  it('parses Shopify decimal strings without going through a float', () => {
    expect(toMinorUnits('41.99')).toBe(4199);
    expect(toMinorUnits('0.10')).toBe(10);
    expect(toMinorUnits('100')).toBe(10_000);
    expect(toMinorUnits('1234.5')).toBe(123_450);
    // 0.1 + 0.2 territory: the case a float would get wrong.
    expect(toMinorUnits('0.29')).toBe(29);
  });

  it('refuses anything that is not a plain decimal', () => {
    expect(toMinorUnits(null)).toBeNull();
    expect(toMinorUnits(undefined)).toBeNull();
    expect(toMinorUnits('')).toBeNull();
    expect(toMinorUnits('$41.99')).toBeNull();
    expect(toMinorUnits('forty')).toBeNull();
  });
});

describe('parseAttributionOrder', () => {
  it('reads the fields attribution reports on', () => {
    const order = orderFrom();

    expect(order).toMatchObject({
      orderId: '5678901234',
      orderName: '#1024',
      orderTotalCents: 4199,
      currency: 'USD',
      email: SHOPPER,
      shopifyCustomerId: '42',
      productIds: ['111', '222'],
    });
    expect(order.orderedAt.toISOString()).toBe(ORDERED_AT.toISOString());
  });

  it('takes the guest order email when there is no customer record', () => {
    const order = parseAttributionOrder(orderPayload({ customer: undefined }))!;

    expect(order.email).toBe(SHOPPER);
    expect(order.shopifyCustomerId).toBeNull();
  });

  it('refuses an order it cannot price or date, rather than inventing one', () => {
    expect(parseAttributionOrder(orderPayload({ total_price: undefined }))).toBeNull();
    expect(parseAttributionOrder(orderPayload({ created_at: undefined }))).toBeNull();
    expect(parseAttributionOrder(orderPayload({ created_at: 'not-a-date' }))).toBeNull();
  });
});

describe('productIdsFromToolOutput', () => {
  it('reads product ids out of the tool output the audit trail stores', () => {
    const output = JSON.stringify([
      { product_id: '111', title: 'Snowboard', variants: [] },
      { product_id: 222, title: 'Bindings', variants: [] },
    ]);

    expect(productIdsFromToolOutput(output)).toEqual(['111', '222']);
  });

  it('returns nothing for a non-JSON tool output instead of throwing', () => {
    // Error results are plain prose, and they reach the same column.
    expect(productIdsFromToolOutput('Could not search products.')).toEqual([]);
    expect(productIdsFromToolOutput(null)).toEqual([]);
    expect(productIdsFromToolOutput('{"not":"an array"}')).toEqual([]);
  });
});

describe('recordConversationAttribution', () => {
  it('records an order with no conversation as direct revenue', async () => {
    const recorded = await recordConversationAttribution(org.id, orderFrom());

    expect(recorded).toMatchObject({ kind: 'direct', matchBasis: 'none', threadId: null });

    // Direct rows are the denominator: without them there is no total to report
    // the attributed share against, because orders live only in Shopify.
    const row = await readRow();
    expect(row.orderTotalCents).toBe(4199);
    expect(row.kind).toBe('direct');
  });

  it('attributes to a verified storefront session ahead of anything weaker', async () => {
    const { customer, thread } = await threadFor(`chat-${randomUUID()}@example.com`);
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: `attr-${randomUUID()}.myshopify.com`,
    });
    await db.storefrontChatSession.create({
      data: {
        organizationId: org.id,
        integrationId: integration.id,
        customerId: customer.id,
        threadId: thread.id,
        storefrontHost: integration.externalAccountId,
        resumeSecretHash: 'x'.repeat(64),
        verifiedEmailHash: hashVerifiedEmail(SHOPPER),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    // A weaker match on the same order, which must lose.
    await threadFor(SHOPPER);

    const recorded = await recordConversationAttribution(org.id, orderFrom());

    expect(recorded).toMatchObject({ kind: 'chat_assisted', matchBasis: 'verified_email' });
    expect(recorded.threadId).toBe(thread.id);
  });

  it('attributes to an ordinary support thread by the address on the order', async () => {
    const { thread } = await threadFor(SHOPPER);

    const recorded = await recordConversationAttribution(org.id, orderFrom());

    expect(recorded).toMatchObject({
      kind: 'chat_assisted',
      matchBasis: 'customer_platform_id',
      threadId: thread.id,
    });
  });

  it('falls back to Shopify\'s own customer link when no address matches', async () => {
    const { thread } = await threadFor(`someone-else-${randomUUID()}@example.com`);
    await db.thread.update({ where: { id: thread.id }, data: { shopifyCustomerId: '42' } });

    const recorded = await recordConversationAttribution(org.id, orderFrom({ email: undefined, customer: { id: 42 } }));

    expect(recorded).toMatchObject({ matchBasis: 'shopify_customer', threadId: thread.id });
  });

  it('calls it product-assisted only when a surfaced product was actually bought', async () => {
    const { thread } = await threadFor(SHOPPER);
    await db.agentAction.create({
      data: {
        turnId: randomUUID(),
        organizationId: org.id,
        threadId: thread.id,
        tool: 'search_shopify_products',
        category: 'read',
        input: { query: 'snowboard' },
        output: JSON.stringify([{ product_id: '111', title: 'Snowboard', variants: [] }]),
        status: 'success',
        mode: 'read_only',
        durationMs: 12,
        executedAt: new Date(ORDERED_AT.getTime() - 60_000),
      },
    });

    const recorded = await recordConversationAttribution(org.id, orderFrom());

    expect(recorded.kind).toBe('product_assisted');
    expect(recorded.matchedProductIds).toEqual(['111']);
  });

  it('stays chat-assisted when the shopper bought something else entirely', async () => {
    const { thread } = await threadFor(SHOPPER);
    await db.agentAction.create({
      data: {
        turnId: randomUUID(),
        organizationId: org.id,
        threadId: thread.id,
        tool: 'search_shopify_products',
        category: 'read',
        input: { query: 'gloves' },
        output: JSON.stringify([{ product_id: '999', title: 'Gloves', variants: [] }]),
        status: 'success',
        mode: 'read_only',
        durationMs: 12,
        executedAt: new Date(ORDERED_AT.getTime() - 60_000),
      },
    });

    const recorded = await recordConversationAttribution(org.id, orderFrom());

    // The agent talked, and something sold, but not the thing it showed. Saying
    // otherwise would be the overclaim this whole feature is written to avoid.
    expect(recorded.kind).toBe('chat_assisted');
    expect(recorded.matchedProductIds).toEqual([]);
  });

  it('ignores a conversation older than the lookback window', async () => {
    const stale = new Date(ORDERED_AT.getTime() - (ATTRIBUTION_LOOKBACK_DAYS + 5) * 86_400_000);
    await threadFor(SHOPPER, { createdAt: stale });

    const recorded = await recordConversationAttribution(org.id, orderFrom());

    expect(recorded.kind).toBe('direct');
  });

  it('ignores a conversation that only started after the order', async () => {
    // The post-purchase support ticket. Counting it would attribute the sale to
    // a conversation about the sale.
    await threadFor(SHOPPER, { createdAt: new Date(ORDERED_AT.getTime() + 86_400_000) });

    const recorded = await recordConversationAttribution(org.id, orderFrom());

    expect(recorded.kind).toBe('direct');
  });

  it('counts one order once however many times the webhook retries', async () => {
    await threadFor(SHOPPER);

    await recordConversationAttribution(org.id, orderFrom());
    await recordConversationAttribution(org.id, orderFrom());
    await recordConversationAttribution(org.id, orderFrom());

    const rows = await db.conversationAttribution.count({ where: { organizationId: org.id } });
    expect(rows).toBe(1);
  });

  it('never lets one org read another org\'s conversations', async () => {
    const other = await createTestOrg();
    try {
      const customer = await createTestCustomer(other.id, SHOPPER);
      await createTestThread(other.id, customer.id, ChannelType.email);

      const recorded = await recordConversationAttribution(org.id, orderFrom());

      expect(recorded.kind).toBe('direct');
      expect(recorded.threadId).toBeNull();
    } finally {
      await cleanupTestData(other.id);
    }
  });

  it('records when the conversation last moved, for the gap the report shows', async () => {
    const { thread } = await threadFor(SHOPPER);
    const message = await createTestMessage(thread.id, 'Do these fit a wide boot?');
    await db.message.update({
      where: { id: message.id },
      data: { sentAt: new Date(ORDERED_AT.getTime() - 7_200_000) },
    });

    await recordConversationAttribution(org.id, orderFrom());

    const row = await readRow();
    expect(row.lastConversationAt?.toISOString()).toBe(
      new Date(ORDERED_AT.getTime() - 7_200_000).toISOString(),
    );
  });
});
