import type { AgentContext, OrderVerificationRecord, VerifiedOrderRef } from "./agent-context.js";
import type { RequestAsk, RequestFacts, RequestReason } from "./classifier-signals.js";
import { hasUnresolvedShopifyCustomer } from "./guest-policy.js";
import { normalizeOrderName } from "./order-reference.js";
import { currentRequestSignals } from "./planner-safety/request.js";

// Direct-message order verification (Instagram, TikTok). A sender with no
// Shopify customer behind them shows an order is theirs by sending its email or
// shipping zip. Gateway code compares their own message with Shopify
// (order-verification-answer); the model only records that it asked
// (`await_order_verification`). Knowledge, not possession, so it unlocks reading
// that order for that sender and never a write: refunds and every other change
// still wait for the merchant.

export const ORDER_VERIFICATION_CHANNELS: ReadonlySet<string> = new Set(["ig_dm", "tiktok"]);

/**
 * Wrong values a sender may send, across every order they ask about, before
 * every later ask goes to the merchant instead. Pooled so a sender cannot reset
 * it by naming another order.
 */
export const ORDER_VERIFICATION_MAX_ATTEMPTS = 5;

/** Times the agent asks about one order before handing it to the merchant. */
export const ORDER_VERIFICATION_MAX_ASKS = 3;

// Requests that act on an order or disclose it. A plain shipping-status question
// stays on the guest-safe read, which shows no personal detail.
const VERIFICATION_ASKS: ReadonlySet<RequestAsk> = new Set([
  "refund", "cancel", "return", "exchange", "address_change",
]);
const VERIFICATION_REASONS: ReadonlySet<RequestReason> = new Set(["damaged", "defective", "wrong_item"]);

/** Whether the request asks for something done to an order: a refund, a change, a return. */
export function asksToChangeOrder(facts: RequestFacts | null | undefined): boolean {
  if (!facts) return false;
  return VERIFICATION_ASKS.has(facts.ask)
    || (facts.alternative !== null && VERIFICATION_ASKS.has(facts.alternative));
}

export function requestNeedsOrderVerification(facts: RequestFacts | null | undefined): boolean {
  if (!facts) return false;
  return asksToChangeOrder(facts)
    || (facts.reason !== undefined && VERIFICATION_REASONS.has(facts.reason));
}

/** Values the sender may still have compared. A confirmed order spent one on its match. */
export function orderVerificationAttemptsLeft(
  records: ReadonlyArray<Pick<OrderVerificationRecord, "attempts" | "verifiedAt">>,
): number {
  const misses = records.reduce(
    (total, record) => total + Math.max(0, record.attempts - (record.verifiedAt ? 1 : 0)),
    0,
  );
  return Math.max(0, ORDER_VERIFICATION_MAX_ATTEMPTS - misses);
}

export type OrderVerificationState =
  /**
   * Confirmed: the sender may read and discuss this order. `resumedRequest` is
   * the request the agent asked about, set only on the turn the answer lands.
   */
  | { kind: "verified"; order: VerifiedOrderRef; method: "email" | "zip"; resumedRequest: RequestFacts | null }
  /** Out of attempts, or asked as often as it may be: the merchant takes it from here. */
  | { kind: "locked"; orderName: string | null }
  /** Asked and not yet confirmed. */
  | { kind: "asked"; orderName: string }
  /** Needs confirming and nothing asked yet; `orderName` is null until they name one. */
  | { kind: "ask"; orderName: string | null };

function stateOf(
  record: OrderVerificationRecord,
  records: readonly OrderVerificationRecord[],
  answeredNow: boolean,
): OrderVerificationState {
  if (record.verifiedAt && record.orderId && record.method) {
    return {
      kind: "verified",
      order: { orderName: record.orderName, orderId: record.orderId },
      method: record.method,
      resumedRequest: answeredNow ? record.requestFacts : null,
    };
  }
  if (orderVerificationAttemptsLeft(records) === 0 || record.asks >= ORDER_VERIFICATION_MAX_ASKS) {
    return { kind: "locked", orderName: record.orderName };
  }
  return { kind: "asked", orderName: record.orderName };
}

// A reply that is part of answering ("hold on", "I don't have it") reads as no
// request of its own; one that asks something else leaves the ask behind.
function continuesAsk(facts: RequestFacts | null): boolean {
  return !facts || facts.ask === "none" || facts.ask === "other" || requestNeedsOrderVerification(facts);
}

function newest(records: readonly OrderVerificationRecord[]): OrderVerificationRecord | null {
  return records.reduce<OrderVerificationRecord | null>(
    (latest, record) => (!latest || record.requestedAt > latest.requestedAt ? record : latest),
    null,
  );
}

/**
 * The one answer to "where does this sender stand on the order they are asking
 * about?" The prompt section, the planner's tool set, the routing evidence and
 * the review signal all read it, so they cannot disagree. Null on every thread
 * this does not apply to, which leaves that turn exactly as it was.
 *
 * A message that answered an ask decides the order before the classifier does
 * when it is the latest one: a bare "94107" can be classified as order #94107,
 * and the answer must resume the order that was asked about. An answer earlier
 * in the burst gives way to an order named after it.
 */
export function orderVerificationState(ctx: AgentContext): OrderVerificationState | null {
  if (!ORDER_VERIFICATION_CHANNELS.has(ctx.thread.channelType)) return null;
  if (!hasUnresolvedShopifyCustomer(ctx, false)) return null;

  const records = ctx.orderVerifications ?? [];
  const current = new Set(ctx.currentCustomerMessageIds ?? []);
  const answered = newest(records.filter(record => (
    record.answeredMessageId !== null && current.has(record.answeredMessageId)
  )));
  if (answered && answered.answeredMessageId === ctx.thread.latestCustomerMessageId) {
    return stateOf(answered, records, true);
  }

  const facts = currentRequestSignals(ctx)?.requestFacts ?? null;
  const requestedOrder = facts?.order ? normalizeOrderName(facts.order) : null;

  const named = requestedOrder ? records.find(record => record.orderName === requestedOrder) : undefined;
  if (named) return stateOf(named, records, named === answered);
  if (answered && !requestedOrder) return stateOf(answered, records, true);

  // The order this thread last asked about, unless the sender has named another
  // or moved on to something else. A verified one stays readable here.
  const latestHere = newest(records.filter(record => record.threadId === ctx.thread.id));
  if (latestHere && !requestedOrder && (latestHere.verifiedAt !== null || continuesAsk(facts))) {
    return stateOf(latestHere, records, false);
  }

  if (!requestNeedsOrderVerification(facts)) return null;
  return orderVerificationAttemptsLeft(records) === 0
    ? { kind: "locked", orderName: requestedOrder }
    : { kind: "ask", orderName: requestedOrder };
}

/** The orders this sender has confirmed, for scoping reads and the review signal. */
export function verifiedOrderRefs(ctx: Pick<AgentContext, "orderVerifications">): VerifiedOrderRef[] {
  return (ctx.orderVerifications ?? []).flatMap(record => (
    record.verifiedAt && record.orderId ? [{ orderName: record.orderName, orderId: record.orderId }] : []
  ));
}
