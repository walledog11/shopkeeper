import type { AgentContext, OrderVerificationRecord, VerifiedOrderRef } from "./agent-context.js";
import type { RequestAsk, RequestFacts, RequestReason } from "./classifier-signals.js";
import { hasUnresolvedShopifyCustomer } from "./guest-policy.js";
import { normalizeOrderName } from "./order-reference.js";
import { currentRequestSignals } from "./planner-safety/request.js";
import { ORDER_VERIFICATION_CHANNELS } from "./thread-constants.js";

// Direct-message order verification (Instagram, TikTok). A sender with no
// Shopify customer behind them shows an order is theirs by sending its email or
// shipping zip. Gateway code compares their own message with Shopify
// (order-verification-answer); the model only records that it asked
// (`await_order_verification`). Knowledge, not possession, so it unlocks reading
// that order for that sender and never a write: refunds and every other change
// still wait for the merchant.

export { ORDER_VERIFICATION_CHANNELS };

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

/** How long an ask stays open to an answer, and a "which order?" ask to the order. */
export const ORDER_VERIFICATION_ANSWER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** The request an ask was made about, as stored on its row. */
export interface OrderVerificationRequest {
  facts: RequestFacts;
  /** The classifier read it as asking for compensation, which `facts` alone may not show. */
  compensation: boolean;
}

/**
 * The request to keep for an ask: what this message asks, when it asks for
 * something that needs the order confirmed, with a reason an earlier ask on
 * this conversation knew filled in; otherwise the earlier ask's request. A reply
 * that only names the order ("it's 1043") keeps the request it answers.
 */
export function mergeOrderVerificationRequest(
  current: OrderVerificationRequest | null,
  earlier: OrderVerificationRequest | null,
): OrderVerificationRequest | null {
  if (current && requestNeedsOrderVerification(current.facts)) {
    const reason = current.facts.reason ?? earlier?.facts.reason;
    return {
      facts: reason === undefined ? current.facts : { ...current.facts, reason },
      compensation: current.compensation || Boolean(earlier?.compensation),
    };
  }
  return earlier ?? null;
}

function requestOf(record: OrderVerificationRecord): OrderVerificationRequest | null {
  return record.requestFacts ? { facts: record.requestFacts, compensation: record.compensationRequested } : null;
}

export type OrderVerificationState =
  /**
   * Confirmed: the sender may read and discuss this order. `resumedRequest` is
   * the request the agent asked about, set only on the turn the answer lands.
   */
  | { kind: "verified"; order: VerifiedOrderRef; method: "email" | "zip"; resumedRequest: OrderVerificationRequest | null }
  /** Out of attempts, or asked as often as it may be: the merchant takes it from here. */
  | { kind: "locked"; orderName: string | null }
  /**
   * Asked and not yet confirmed; `orderName` is null while the open question is
   * which order. `pendingRequest` is what the ask was about.
   */
  | { kind: "asked"; orderName: string | null; pendingRequest: OrderVerificationRequest | null }
  /** Needs confirming and nothing asked yet; `orderName` is null until they name one. */
  | { kind: "ask"; orderName: string | null; pendingRequest: OrderVerificationRequest | null };

type NamedRecord = OrderVerificationRecord & { orderName: string };

function isNamed(record: OrderVerificationRecord): record is NamedRecord {
  return record.orderName !== null;
}

function stateOf(
  record: NamedRecord,
  records: readonly OrderVerificationRecord[],
  options: { answeredNow: boolean; request?: OrderVerificationRequest | null },
): OrderVerificationState {
  const request = options.request !== undefined ? options.request : requestOf(record);
  if (record.verifiedAt && record.orderId && record.method) {
    return {
      kind: "verified",
      order: { orderName: record.orderName, orderId: record.orderId },
      method: record.method,
      resumedRequest: options.answeredNow ? request : null,
    };
  }
  if (orderVerificationAttemptsLeft(records) === 0 || record.asks >= ORDER_VERIFICATION_MAX_ASKS) {
    return { kind: "locked", orderName: record.orderName };
  }
  return { kind: "asked", orderName: record.orderName, pendingRequest: request };
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

/**
 * A different question about an order, answered by the guest-safe read or the
 * store's information rather than by confirming the order. A reply to "which
 * order?" that names one answers it unless it is one of these.
 */
export function asksAnotherQuestion(facts: RequestFacts | null): boolean {
  return facts?.ask === "order_status" || facts?.ask === "product_question" || facts?.ask === "policy_question";
}

const asksSomethingElse = asksAnotherQuestion;

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
export function orderVerificationState(ctx: AgentContext, now: Date = new Date()): OrderVerificationState | null {
  if (!ORDER_VERIFICATION_CHANNELS.has(ctx.thread.channelType)) return null;
  if (!hasUnresolvedShopifyCustomer(ctx, false)) return null;

  const records = ctx.orderVerifications ?? [];
  const named = records.filter(isNamed);
  const signals = currentRequestSignals(ctx);
  const facts = signals?.requestFacts ?? null;
  const currentRequest = facts ? { facts, compensation: Boolean(signals?.intents.compensation_request) } : null;
  const current = new Set(ctx.currentCustomerMessageIds ?? []);
  const answered = newest(named.filter(record => (
    record.answeredMessageId !== null && current.has(record.answeredMessageId)
  )));
  // The gateway compares only a message that continues the ask, so this holds
  // whenever an answer was recorded; it keeps the two from disagreeing.
  if (answered && continuesAsk(facts)) return stateOf(answered, records, { answeredNow: true });

  const requestedOrder = facts?.order ? normalizeOrderName(facts.order) : null;
  const namedNow = requestedOrder ? named.find(record => record.orderName === requestedOrder) : undefined;

  // The "which order?" ask open on this conversation, unless it was answered
  // in an earlier burst. Its request carries over to the order the reply names.
  const unnamed = records.find(record => (
    record.orderName === null
    && record.threadId === ctx.thread.id
    && now.getTime() - record.requestedAt.getTime() < ORDER_VERIFICATION_ANSWER_WINDOW_MS
    && (record.answeredMessageId === null || current.has(record.answeredMessageId))
  ));
  if (unnamed && requestedOrder && !asksSomethingElse(facts)) {
    const request = mergeOrderVerificationRequest(currentRequest, requestOf(unnamed));
    if (namedNow) return stateOf(namedNow, records, { answeredNow: true, request });
    return orderVerificationAttemptsLeft(records) === 0
      ? { kind: "locked", orderName: requestedOrder }
      : { kind: "ask", orderName: requestedOrder, pendingRequest: request };
  }

  // An order already asked about, when this message is still about confirming
  // or changing it. A plain status question about it keeps the guest-safe read.
  if (namedNow && (namedNow.verifiedAt !== null || continuesAsk(facts))) {
    return stateOf(namedNow, records, { answeredNow: false });
  }

  // The last ask on this thread, unless the sender has named another order or
  // moved on to something else. A verified order stays readable here.
  const latestHere = newest([
    ...named.filter(record => record.threadId === ctx.thread.id),
    ...(unnamed ? [unnamed] : []),
  ]);
  if (latestHere && !requestedOrder) {
    if (!isNamed(latestHere)) {
      if (continuesAsk(facts)) {
        return orderVerificationAttemptsLeft(records) === 0 || latestHere.asks >= ORDER_VERIFICATION_MAX_ASKS
          ? { kind: "locked", orderName: null }
          : { kind: "asked", orderName: null, pendingRequest: requestOf(latestHere) };
      }
    } else if (latestHere.verifiedAt !== null || continuesAsk(facts)) {
      return stateOf(latestHere, records, { answeredNow: false });
    }
  }

  if (!requestNeedsOrderVerification(facts)) return null;
  return orderVerificationAttemptsLeft(records) === 0
    ? { kind: "locked", orderName: requestedOrder }
    : { kind: "ask", orderName: requestedOrder, pendingRequest: null };
}

/** The orders this sender has confirmed, for scoping reads and the review signal. */
export function verifiedOrderRefs(ctx: Pick<AgentContext, "orderVerifications">): VerifiedOrderRef[] {
  return (ctx.orderVerifications ?? []).flatMap(record => (
    record.verifiedAt && record.orderId && record.orderName
      ? [{ orderName: record.orderName, orderId: record.orderId }]
      : []
  ));
}
