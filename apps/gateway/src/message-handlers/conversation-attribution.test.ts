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
  formatAttributionLine,
  loadAttributionRollup,
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

describe('the briefing line', () => {
  async function attribute(kind: 'direct' | 'chat_assisted', cents: number, orderedAt: Date) {
    const threadId = kind === 'direct' ? null : (await threadFor(`c-${randomUUID()}@example.com`)).thread.id;
    await db.conversationAttribution.create({
      data: {
        organizationId: org.id,
        threadId,
        orderId: randomUUID(),
        orderName: '#1',
        orderTotalCents: cents,
        currency: 'USD',
        kind,
        matchBasis: kind === 'direct' ? 'none' : 'customer_platform_id',
        orderedAt,
      },
    });
  }

  it('counts only orders inside the briefing window', async () => {
    const since = new Date(Date.now() - 3_600_000);
    await attribute('chat_assisted', 4199, new Date());
    await attribute('direct', 1000, new Date());
    // Yesterday's order was already reported in yesterday's briefing. Counting
    // it again is the stock-versus-flow trap: the number would ratchet up all
    // week and re-report revenue the merchant has already seen.
    await attribute('chat_assisted', 999_00, new Date(Date.now() - 48 * 3_600_000));

    const rollup = await loadAttributionRollup(org.id, since);

    expect(rollup).toMatchObject({
      orderCount: 2,
      attributedCount: 1,
      totalCents: 5199,
      attributedCents: 4199,
    });
  });

  it('says nothing when no order followed a conversation', async () => {
    await attribute('direct', 4199, new Date());

    const rollup = await loadAttributionRollup(org.id, new Date(Date.now() - 3_600_000));

    // A line that says "0 of your 3 orders" every morning is noise, and the
    // briefing earns its place by not printing the absence of news.
    expect(formatAttributionLine(rollup)).toBeNull();
  });

  it('reports the share without claiming it caused the sale', () => {
    const line = formatAttributionLine({
      orderCount: 11,
      attributedCount: 3,
      totalCents: 194_000,
      attributedCents: 41_200,
      currency: 'USD',
    });

    expect(line).toBe("3 of your 11 orders came from someone who'd talked to me first — $412 of $1,940.");
    // "came from someone who'd talked to me first" is a join, which is what was
    // proved. "I earned you $412" is a causal claim, which was not.
    expect(line).not.toMatch(/earned|thanks to|because/i);
  });

  it('drops the amounts rather than adding two currencies together', () => {
    const line = formatAttributionLine({
      orderCount: 4,
      attributedCount: 2,
      totalCents: 20_000,
      attributedCents: 9_000,
      currency: null,
    });

    expect(line).toBe("2 of your 4 orders came from someone who'd talked to me first.");
  });

  it('reads naturally when there is only one order', () => {
    const line = formatAttributionLine({
      orderCount: 1,
      attributedCount: 1,
      totalCents: 4199,
      attributedCents: 4199,
      currency: 'USD',
    });

    // "1 of your 1 order — $41.99 of $41.99" is the tell that a template wrote
    // it: the share is stated twice and there is no share.
    expect(line).toBe("Your one order came from someone who'd talked to me first — $41.99.");
  });
});
