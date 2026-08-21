import { db } from '@shopkeeper/db';
import { hashVerifiedEmail } from '@shopkeeper/agent/storefront-verification';
import { CHANNEL_TYPE } from '@shopkeeper/agent/thread-constants';
import logger from '../logger.js';
import type { ShopifyOrderPayload } from '../types.js';

// Connects a paid order back to the conversation that preceded it, if there was
// one. Reported as attribution, never as proof the conversation caused the sale:
// the merchant is told a shopper who talked to the agent went on to buy, which
// is a fact, rather than that the agent earned the revenue, which is not.
//
// Every order gets a row, `direct` ones included. That is not padding — orders
// are read live from Shopify and persisted nowhere else, so without the direct
// rows there is no denominator to report the attributed share against.

type AttributionKind = 'direct' | 'chat_assisted' | 'product_assisted';
type AttributionMatchBasis =
  | 'none'
  | 'verified_email'
  | 'customer_platform_id'
  | 'shopify_customer';

// How far back a conversation may sit and still be counted against an order. A
// support thread from four months ago did not precede this purchase in any
// sense a merchant would accept, and without a bound every repeat customer's
// every order attributes forever to one old ticket.
export const ATTRIBUTION_LOOKBACK_DAYS = 30;

// The tool whose output names what the agent actually put in front of the
// shopper. `product_assisted` means one of those products was bought. Taken
// from the registry rather than guessed — a name that matches no tool would
// make this classification silently unreachable, which is worse than absent.
const PRODUCT_TOOLS = ['search_shopify_products'];

export interface AttributionOrder {
  orderId: string;
  orderName: string;
  orderTotalCents: number;
  currency: string;
  orderedAt: Date;
  email: string | null;
  shopifyCustomerId: string | null;
  productIds: string[];
}

interface ConversationMatch {
  threadId: string;
  customerId: string | null;
  matchBasis: AttributionMatchBasis;
  lastConversationAt: Date | null;
}

// Shopify sends money as a decimal string ("41.99"). Parsed to minor units
// rather than carried as a float, so summing a month of orders cannot drift.
export function toMinorUnits(amount: string | number | null | undefined): number | null {
  if (amount == null) return null;
  const text = typeof amount === 'number' ? amount.toString() : amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
  return negative ? -cents : cents;
}

export function parseAttributionOrder(payload: ShopifyOrderPayload): AttributionOrder | null {
  if (payload?.id == null) return null;

  const orderTotalCents = toMinorUnits(payload.total_price);
  if (orderTotalCents == null) return null;

  const orderedAt = payload.created_at ? new Date(payload.created_at) : null;
  if (!orderedAt || Number.isNaN(orderedAt.getTime())) return null;

  const productIds = (payload.line_items ?? [])
    .map((item) => (item?.product_id == null ? null : String(item.product_id)))
    .filter((id): id is string => id != null);

  return {
    orderId: String(payload.id),
    orderName: payload.name || (payload.order_number ? `#${payload.order_number}` : String(payload.id)),
    orderTotalCents,
    currency: payload.currency || 'USD',
    orderedAt,
    email: payload.email ?? payload.customer?.email ?? null,
    shopifyCustomerId: payload.customer?.id == null ? null : String(payload.customer.id),
    productIds,
  };
}

// Ordered by how strongly the link was proved, not by convenience. A verified
// email is something the shopper demonstrated control of; a platform id is a
// string that happens to match; a Shopify customer id is Shopify's own join.
async function findConversation(
  organizationId: string,
  order: AttributionOrder,
): Promise<ConversationMatch | null> {
  const since = new Date(order.orderedAt.getTime() - ATTRIBUTION_LOOKBACK_DAYS * 86_400_000);

  if (order.email) {
    const session = await db.storefrontChatSession.findFirst({
      where: {
        organizationId,
        verifiedEmailHash: hashVerifiedEmail(order.email),
        threadId: { not: null },
        thread: { createdAt: { lte: order.orderedAt }, deletedAt: null },
      },
      orderBy: { lastSeenAt: 'desc' },
      select: { threadId: true, customerId: true },
    });
    if (session?.threadId) {
      return {
        threadId: session.threadId,
        customerId: session.customerId,
        matchBasis: 'verified_email',
        lastConversationAt: await lastConversationAt(session.threadId, order.orderedAt),
      };
    }
  }

  if (order.email) {
    const thread = await db.thread.findFirst({
      where: {
        organizationId,
        customer: { platformId: order.email, deletedAt: null },
        channelType: { notIn: [CHANNEL_TYPE.SMS_AGENT, CHANNEL_TYPE.DASHBOARD_AGENT] },
        createdAt: { gte: since, lte: order.orderedAt },
        deletedAt: null,
      },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true, customerId: true },
    });
    if (thread) {
      return {
        threadId: thread.id,
        customerId: thread.customerId,
        matchBasis: 'customer_platform_id',
        lastConversationAt: await lastConversationAt(thread.id, order.orderedAt),
      };
    }
  }

  if (order.shopifyCustomerId) {
    const thread = await db.thread.findFirst({
      where: {
        organizationId,
        shopifyCustomerId: order.shopifyCustomerId,
        channelType: { notIn: [CHANNEL_TYPE.SMS_AGENT, CHANNEL_TYPE.DASHBOARD_AGENT] },
        createdAt: { gte: since, lte: order.orderedAt },
        deletedAt: null,
      },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true, customerId: true },
    });
    if (thread) {
      return {
        threadId: thread.id,
        customerId: thread.customerId,
        matchBasis: 'shopify_customer',
        lastConversationAt: await lastConversationAt(thread.id, order.orderedAt),
      };
    }
  }

  return null;
}

async function lastConversationAt(threadId: string, before: Date): Promise<Date | null> {
  const message = await db.message.findFirst({
    where: { threadId, deletedAt: null, sentAt: { lte: before } },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  });
  return message?.sentAt ?? null;
}

// Which of the products the agent surfaced were actually bought. Read off the
// audit trail rather than re-derived: AgentAction stores each product tool's
// output verbatim, and that output is JSON carrying `product_id`.
export function productIdsFromToolOutput(output: string | null): string[] {
  if (!output) return [];
  try {
    const parsed: unknown = JSON.parse(output);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => (entry as { product_id?: unknown })?.product_id)
      .filter((id): id is string | number => typeof id === 'string' || typeof id === 'number')
      .map(String);
  } catch {
    // Not every tool output is JSON — an error string is expected here.
    return [];
  }
}

async function surfacedProductIds(threadId: string, before: Date): Promise<Set<string>> {
  const actions = await db.agentAction.findMany({
    where: { threadId, tool: { in: PRODUCT_TOOLS }, executedAt: { lte: before } },
    select: { output: true },
  });
  const ids = new Set<string>();
  for (const action of actions) {
    for (const id of productIdsFromToolOutput(action.output)) ids.add(id);
  }
  return ids;
}

export interface RecordedAttribution {
  kind: AttributionKind;
  matchBasis: AttributionMatchBasis;
  threadId: string | null;
  matchedProductIds: string[];
}

export async function recordConversationAttribution(
  organizationId: string,
  order: AttributionOrder,
): Promise<RecordedAttribution> {
  const match = await findConversation(organizationId, order);

  let kind: AttributionKind = 'direct';
  let matchedProductIds: string[] = [];

  if (match) {
    const surfaced = await surfacedProductIds(match.threadId, order.orderedAt);
    matchedProductIds = order.productIds.filter((id) => surfaced.has(id));
    kind = matchedProductIds.length > 0 ? 'product_assisted' : 'chat_assisted';
  }

  const row = {
    organizationId,
    threadId: match?.threadId ?? null,
    customerId: match?.customerId ?? null,
    orderId: order.orderId,
    orderName: order.orderName,
    orderTotalCents: order.orderTotalCents,
    currency: order.currency,
    kind,
    matchBasis: match?.matchBasis ?? ('none' as const),
    matchedProductIds: matchedProductIds.length > 0 ? matchedProductIds : undefined,
    lastConversationAt: match?.lastConversationAt ?? null,
    orderedAt: order.orderedAt,
  };

  // Order webhooks retry and orders/create can arrive more than once. The
  // unique index on (organization_id, order_id) is what stops one order being
  // counted as revenue twice; the update keeps a late-arriving conversation
  // match from being lost to a row written moments earlier.
  await db.conversationAttribution.upsert({
    where: { organizationId_orderId: { organizationId, orderId: order.orderId } },
    create: row,
    update: {
      kind: row.kind,
      matchBasis: row.matchBasis,
      threadId: row.threadId,
      customerId: row.customerId,
      matchedProductIds: row.matchedProductIds,
      lastConversationAt: row.lastConversationAt,
      orderTotalCents: row.orderTotalCents,
      currency: row.currency,
    },
  });

  return {
    kind,
    matchBasis: row.matchBasis,
    threadId: row.threadId,
    matchedProductIds,
  };
}

// Attribution is reporting, not delivery. A failure here must never cost the
// merchant the order event itself, so the caller is not given the chance to
// throw on it.
export async function recordConversationAttributionSafely(
  organizationId: string,
  payload: ShopifyOrderPayload,
  traceId?: string,
): Promise<void> {
  try {
    const order = parseAttributionOrder(payload);
    if (!order) return;
    const recorded = await recordConversationAttribution(organizationId, order);
    logger.info(
      {
        organizationId,
        traceId,
        orderName: order.orderName,
        kind: recorded.kind,
        matchBasis: recorded.matchBasis,
      },
      '[Attribution] Recorded order attribution',
    );
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error), organizationId, traceId },
      '[Attribution] Failed to record order attribution',
    );
  }
}

export interface AttributionRollup {
  orderCount: number;
  attributedCount: number;
  totalCents: number;
  attributedCents: number;
  currency: string | null;
}

// Scoped to the briefing cursor, never to current state. "Since your last
// briefing" has to mean the flow of orders in that window — a stock count would
// re-report the same revenue every morning and ratchet up all week.
export async function loadAttributionRollup(
  organizationId: string,
  since: Date,
): Promise<AttributionRollup> {
  const rows = await db.conversationAttribution.findMany({
    where: { organizationId, orderedAt: { gte: since } },
    select: { kind: true, orderTotalCents: true, currency: true },
  });

  const currencies = new Set(rows.map((row) => row.currency));
  let attributedCount = 0;
  let totalCents = 0;
  let attributedCents = 0;

  for (const row of rows) {
    totalCents += row.orderTotalCents;
    if (row.kind !== 'direct') {
      attributedCount += 1;
      attributedCents += row.orderTotalCents;
    }
  }

  return {
    orderCount: rows.length,
    attributedCount,
    totalCents,
    attributedCents,
    // Money is only summable within one currency. A mixed window reports the
    // counts and drops the amounts rather than adding pounds to dollars.
    currency: currencies.size === 1 ? [...currencies][0] : null,
  };
}

function formatMoney(cents: number, currency: string): string {
  const amount = (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return currency === 'USD' ? `$${amount}` : `${amount} ${currency}`;
}

// Deliberately "talked to me first", not "I earned this". The join is a proved
// email or a matching customer record, which establishes that the shopper who
// talked also bought — not that the conversation caused the purchase. Claiming
// more is the overclaim this whole feature is written to avoid.
export function formatAttributionLine(rollup: AttributionRollup): string | null {
  if (rollup.orderCount === 0 || rollup.attributedCount === 0) return null;

  const everyOrder = rollup.attributedCount === rollup.orderCount;
  const money = rollup.currency
    ? everyOrder
      ? ` — ${formatMoney(rollup.attributedCents, rollup.currency)}`
      : ` — ${formatMoney(rollup.attributedCents, rollup.currency)} of ${formatMoney(rollup.totalCents, rollup.currency)}`
    : '';

  // "1 of your 1 order" is the tell that a template wrote the sentence. When
  // every order in the window is attributed there is no share to state, so the
  // count carries it alone.
  const subject = everyOrder
    ? rollup.orderCount === 1
      ? 'Your one order'
      : `All ${rollup.orderCount} of your orders`
    : `${rollup.attributedCount} of your ${rollup.orderCount} orders`;

  return `${subject} came from someone who'd talked to me first${money}.`;
}

export async function loadAttributionLine(
  organizationId: string,
  since: Date,
): Promise<string | null> {
  try {
    return formatAttributionLine(await loadAttributionRollup(organizationId, since));
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error), organizationId },
      '[Attribution] Briefing line unavailable',
    );
    return null;
  }
}
