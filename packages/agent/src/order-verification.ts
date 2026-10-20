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

/** Messages compared per order before it goes to the merchant instead. */
export const ORDER_VERIFICATION_MAX_ATTEMPTS = 5;

// Requests that act on an order or disclose it. A plain shipping-status question
// stays on the guest-safe read, which shows no personal detail.
const VERIFICATION_ASKS: ReadonlySet<RequestAsk> = new Set([
  "refund", "cancel", "return", "exchange", "address_change",
]);
const VERIFICATION_REASONS: ReadonlySet<RequestReason> = new Set(["damaged", "defective", "wrong_item"]);

export function requestNeedsOrderVerification(facts: RequestFacts | null | undefined): boolean {
  if (!facts) return false;
  return VERIFICATION_ASKS.has(facts.ask)
    || (facts.alternative !== null && VERIFICATION_ASKS.has(facts.alternative))
    || (facts.reason !== undefined && VERIFICATION_REASONS.has(facts.reason));
}

export type OrderVerificationState =
  /** Confirmed: the sender may read and discuss this order. */
  | { kind: "verified"; order: VerifiedOrderRef; method: "email" | "zip"; requestFacts: RequestFacts | null }
  /** Asked too many times without a match: the merchant takes it from here. */
  | { kind: "locked"; orderName: string }
  /** Asked on this thread and not yet confirmed. */
  | { kind: "asked"; orderName: string; attemptsRemaining: number }
  /** Needs confirming and nothing asked yet; `orderName` is null until they name one. */
  | { kind: "ask"; orderName: string | null };

function isLocked(record: OrderVerificationRecord): boolean {
  return record.verifiedAt === null && record.attempts >= ORDER_VERIFICATION_MAX_ATTEMPTS;
}

function stateOf(record: OrderVerificationRecord): OrderVerificationState {
  if (record.verifiedAt && record.orderId && record.method) {
    return {
      kind: "verified",
      order: { orderName: record.orderName, orderId: record.orderId },
      method: record.method,
      requestFacts: record.requestFacts,
    };
  }
  if (isLocked(record)) return { kind: "locked", orderName: record.orderName };
  return {
    kind: "asked",
    orderName: record.orderName,
    attemptsRemaining: ORDER_VERIFICATION_MAX_ATTEMPTS - record.attempts,
  };
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
 * A message that answered an ask decides the order before the classifier does:
 * a bare "94107" can be classified as order #94107, and the answer must resume
 * the order that was asked about.
 */
export function orderVerificationState(ctx: AgentContext): OrderVerificationState | null {
  if (!ORDER_VERIFICATION_CHANNELS.has(ctx.thread.channelType)) return null;
  if (!hasUnresolvedShopifyCustomer(ctx, false)) return null;

  const records = ctx.orderVerifications ?? [];
  const current = new Set(ctx.currentCustomerMessageIds ?? []);
  const answered = newest(records.filter(record => (
    record.answeredMessageId !== null && current.has(record.answeredMessageId)
  )));
  if (answered) return stateOf(answered);

  const facts = currentRequestSignals(ctx)?.requestFacts ?? null;
  const requestedOrder = facts?.order ? normalizeOrderName(facts.order) : null;

  const named = requestedOrder ? records.find(record => record.orderName === requestedOrder) : undefined;
  if (named) return stateOf(named);

  // Still answering the last ask on this thread, or locked out of it. Naming
  // another order moves on to that one.
  const askedHere = newest(records.filter(record => record.threadId === ctx.thread.id && !record.verifiedAt));
  if (askedHere && !requestedOrder && continuesAsk(facts)) return stateOf(askedHere);

  const verified = newest(records.filter(record => record.verifiedAt !== null));
  if (verified && !requestedOrder) return stateOf(verified);

  if (!requestNeedsOrderVerification(facts)) return null;
  // Locked out of one order, the sender's next one goes to the merchant too, so
  // the attempt cap bounds the sender rather than each order number they try.
  const lockedOut = newest(records.filter(isLocked));
  return lockedOut ? stateOf(lockedOut) : { kind: "ask", orderName: requestedOrder };
}

/** The orders this sender has confirmed, for scoping reads and the review signal. */
export function verifiedOrderRefs(ctx: Pick<AgentContext, "orderVerifications">): VerifiedOrderRef[] {
  return (ctx.orderVerifications ?? []).flatMap(record => (
    record.verifiedAt && record.orderId ? [{ orderName: record.orderName, orderId: record.orderId }] : []
  ));
}
