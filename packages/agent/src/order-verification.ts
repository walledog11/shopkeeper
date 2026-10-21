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

type NamedRecord = OrderVerificationRecord & { orderName: string };

function isNamed(record: OrderVerificationRecord): record is NamedRecord {
  return record.orderName !== null;
}

function stateOf(
  record: NamedRecord,
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

// The ask for which order, still open on this thread.
function stateOfUnnamed(
  record: OrderVerificationRecord,
  records: readonly OrderVerificationRecord[],
): OrderVerificationState {
  return orderVerificationAttemptsLeft(records) === 0 || record.asks >= ORDER_VERIFICATION_MAX_ASKS
    ? { kind: "locked", orderName: null }
    : { kind: "ask", orderName: null };
}

/**
 * Whether a message still belongs to an open ask: an answer ("94107", "hold on",
 * "I don't have it") reads as no request of its own, or as one that needs the
 * order confirmed. One that asks something else leaves the ask behind, and a
 * number in it is not an answer. Null facts (no aligned classification) cannot
 * say otherwise.
 */
export function continuesOrderVerificationAsk(facts: RequestFacts | null): boolean {
  return !facts || facts.ask === "none" || facts.ask === "other" || requestNeedsOrderVerification(facts);
}

const continuesAsk = continuesOrderVerificationAsk;

function newest<T extends OrderVerificationRecord>(records: readonly T[]): T | null {
  return records.reduce<T | null>(
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
 * A message in this burst that answered an ask decides the order before the
 * classifier does: a bare "94107" can be classified as order #94107, and the
 * answer must resume the order that was asked about. The gateway clears that
 * mark when a later message in the burst names another order.
 */
export function orderVerificationState(ctx: AgentContext): OrderVerificationState | null {
  if (!ORDER_VERIFICATION_CHANNELS.has(ctx.thread.channelType)) return null;
  if (!hasUnresolvedShopifyCustomer(ctx, false)) return null;

  const records = ctx.orderVerifications ?? [];
  const named = records.filter(isNamed);
  const facts = currentRequestSignals(ctx)?.requestFacts ?? null;
  const current = new Set(ctx.currentCustomerMessageIds ?? []);
  const answered = newest(named.filter(record => (
    record.answeredMessageId !== null && current.has(record.answeredMessageId)
  )));
  // The gateway compares only a message that continues the ask, so this holds
  // whenever an answer was recorded; it keeps the two from disagreeing.
  if (answered && continuesAsk(facts)) return stateOf(answered, records, true);

  const requestedOrder = facts?.order ? normalizeOrderName(facts.order) : null;

  // An order already asked about, when this message is still about confirming
  // or changing it. A plain status question about it keeps the guest-safe read.
  const namedNow = requestedOrder ? named.find(record => record.orderName === requestedOrder) : undefined;
  if (namedNow && (namedNow.verifiedAt !== null || continuesAsk(facts))) {
    return stateOf(namedNow, records, false);
  }

  // The last ask on this thread, unless the sender has named another order or
  // moved on to something else. A verified order stays readable here.
  const latestHere = newest(records.filter(record => record.threadId === ctx.thread.id));
  if (latestHere && !requestedOrder) {
    if (!isNamed(latestHere)) {
      if (continuesAsk(facts)) return stateOfUnnamed(latestHere, records);
    } else if (latestHere.verifiedAt !== null || continuesAsk(facts)) {
      return stateOf(latestHere, records, false);
    }
  }

  if (!requestNeedsOrderVerification(facts)) return null;
  return orderVerificationAttemptsLeft(records) === 0
    ? { kind: "locked", orderName: requestedOrder }
    : { kind: "ask", orderName: requestedOrder };
}

/** The orders this sender has confirmed, for scoping reads and the review signal. */
export function verifiedOrderRefs(ctx: Pick<AgentContext, "orderVerifications">): VerifiedOrderRef[] {
  return (ctx.orderVerifications ?? []).flatMap(record => (
    record.verifiedAt && record.orderId && record.orderName
      ? [{ orderName: record.orderName, orderId: record.orderId }]
      : []
  ));
}
