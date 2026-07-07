import type { AgentContext } from "./agent-context.js";
import { isOperatorChannel } from "./thread-constants.js";
import { ORDER_REFERENCE_RE } from "./order-reference.js";

export { isOperatorChannel, ORDER_REFERENCE_RE };

const ORDER_STATUS_PHRASES = [
  "status",
  "order status",
  "status of",
  "status on",
  "status for",
  "where is",
  "where's",
  "track",
  "tracking",
  "tracking number",
  "tracking numbers",
  "carrier",
  "delivery",
  "delivered",
  "shipped",
  "shipment",
  "fulfilled",
  "fulfillment",
  "wismo",
] as const;

export const ORDER_STATUS_ACTION_PHRASES = [
  "cancel",
  "refund",
  "exchange",
  "return policy",
  "change",
  "update",
  "edit",
  "swap",
  "remove",
  "add ",
  "create",
  "note",
  "email",
  "reply",
  "send",
  "tag",
  "close",
  "policy",
  "faq",
  "kb",
  "knowledge base",
] as const;

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

const CUSTOMER_MUTATIVE_PHRASES = [
  "cancel",
  "refund",
  "exchange",
  "return my order",
  "return the order",
  "return label",
  "chargeback",
  "dispute",
] as const;

function hasPhrase(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

export function hasMutativePlanningSignals(text: string): boolean {
  return hasPhrase(text.toLowerCase(), ORDER_STATUS_ACTION_PHRASES);
}

export function hasCustomerMutativeIntent(text: string): boolean {
  const lower = text.toLowerCase();
  if (hasPhrase(lower, CUSTOMER_MUTATIVE_PHRASES)) return true;
  if (/\b(change|update|edit)\b/.test(lower) && /\b(address|shipping)\b/.test(lower)) return true;
  if (/\b(create|place|make)\b/.test(lower) && lower.includes("order")) return true;
  return false;
}

export function hasActionableMutativeIntent(...texts: string[]): boolean {
  return texts.some((text) => hasCustomerMutativeIntent(text));
}

// A customer text that *asks about* returns/refunds/cancellations (policy, eligibility, process)
// rather than *requesting* one on their order. These trip the bare "refund"/"cancel" substrings in
// CUSTOMER_MUTATIVE_PHRASES but are informational, so the mutative no-action guards must not strip
// the reply or force a mutative replan on them.
const RETURN_POLICY_QUESTION_RE: readonly RegExp[] = [
  /\b(return|refund|cancellation|exchange)s?\s+polic/,
  /\bdo you (offer|accept|do|allow|take|give|have|provide)\b[^.?!]*\b(refund|return|exchange)/,
  /\bhow (do|does|long|can|would)\b[^.?!]*\b(refund|return|exchange)/,
  /\bcan i (return|exchange|get a refund|send (?:it|this|that|them) back)\b/,
  /\bwho pays\b[^.?!]*\b(return|restocking|shipping)/,
];

// An explicit directive to cancel/refund/return — overrides the question framing above.
const MUTATIVE_REQUEST_RE: readonly RegExp[] = [
  /\b(?:please\s+)?(?:cancel|refund)\s+(?:my|the|this|that|it|order)\b/,
  /\bi(?:'d| would)?\s*(?:like|want|need|wanna)\s+(?:to\s+(?:cancel|refund|return|exchange)|an?\s+(?:refund|cancellation|return|exchange))\b/,
];

export function isInformationalReturnQuestion(text: string): boolean {
  const lower = text.toLowerCase();
  if (ORDER_REFERENCE_RE.test(text)) return false;
  if (MUTATIVE_REQUEST_RE.some((re) => re.test(lower))) return false;
  return RETURN_POLICY_QUESTION_RE.some((re) => re.test(lower));
}

export function hasMutativeRequestIntent(...texts: string[]): boolean {
  return texts.some((text) => hasCustomerMutativeIntent(text) && !isInformationalReturnQuestion(text));
}

export function planningIntentTexts(ctx: AgentContext, instruction: string): string[] {
  const texts = [instruction];
  for (let index = ctx.recentMessages.length - 1; index >= 0; index -= 1) {
    const message = ctx.recentMessages[index];
    if (message.senderType === "customer" && message.contentText?.trim()) {
      texts.push(message.contentText);
      break;
    }
  }
  return texts;
}

const CONTRADICTION_PIVOT_RE = /\b(actually|wait|scratch|never mind|nevermind|on second thought)\b/i;

export function hasSuspectedFraudRefundSignals(...texts: string[]): boolean {
  for (const text of texts) {
    const lower = text.toLowerCase();
    const wantsRefund = /\brefund(?:ed|ing|s)?\b/.test(lower);

    if (/\b(chargeback|dispute|fraudulent|unauthorized)\b/.test(lower)) {
      return true;
    }

    if (wantsRefund) {
      const alternatePaymentRefund = (
        /\b(different|another|alternate|other)\s+(card|payment|account|method)\b/.test(lower)
        || /\bnot the (one|card) i paid with\b/.test(lower)
        || (/\bending\s+\d{4}\b/.test(lower) && /\b(card|account)\b/.test(lower))
      );
      if (alternatePaymentRefund) return true;

      const nonReceipt = /\b(never received|didn't receive|did not receive|not received|non-?receipt)\b/.test(lower);
      const urgent = /\b(right now|immediately|asap|urgent(?:ly)?)\b/.test(lower);
      if (nonReceipt && urgent) return true;
    }
  }
  return false;
}

export function hasForwardedInjectionRefundSignal(...texts: string[]): boolean {
  const combined = texts.join("\n");
  const lower = combined.toLowerCase();
  const looksForwarded = (
    /\bforwarded message\b/.test(lower)
    || /-{3,}\s*forwarded/.test(lower)
    || /\bfw:\s*/.test(lower)
  );
  if (!looksForwarded) return false;

  return (
    /\brefund\b/.test(lower)
    && /\b(issue|process|authorize[d]?)\b/.test(lower)
    && (
      /\bstore owner\b/.test(lower)
      || /\boverride\b/.test(lower)
      || /\bauthorized and instructed\b/.test(lower)
    )
  );
}

export function hasOutOfScopeCommercialRequestSignals(...texts: string[]): boolean {
  for (const text of texts) {
    const lower = text.toLowerCase();
    if (/\bwholesale\b/.test(lower)) return true;
    if (/\bbulk pricing\b/.test(lower)) return true;
    if (/\bb2b\b/.test(lower)) return true;
    if (/\bquote\b/.test(lower) && (/\bunits?\b/.test(lower) || /\bpricing\b/.test(lower))) {
      return true;
    }
    if (/\b\d{2,}\s+units?\b/.test(lower) && /\b(pricing|quote|cost|price)\b/.test(lower)) {
      return true;
    }
  }
  return false;
}

export function hasContradictoryInstructionSignals(...texts: string[]): boolean {
  const combined = texts.join(" ").toLowerCase();
  const wantsCancel = /\bcancel(?:lation|led|ing)?\b/.test(combined);
  const wantsRefund = /\brefund(?:ed|ing|s)?\b/.test(combined);
  const wantsAddressChange = /\b(change|update|edit)\b/.test(combined)
    && /\b(address|shipping)\b/.test(combined);
  const wantsShipDespiteRefund = wantsRefund && /\bstill\s+(send|ship)\b/.test(combined);
  const hasPivot = CONTRADICTION_PIVOT_RE.test(combined);

  const distinctActions = [wantsCancel, wantsRefund, wantsAddressChange].filter(Boolean).length;
  if (wantsShipDespiteRefund) return true;
  if (distinctActions >= 2 && hasPivot) return true;
  return false;
}

export function looksLikeOrderStatusIntent(instruction: string): boolean {
  const text = instruction.toLowerCase();
  const mentionsOrderContext = text.includes("order") || text.includes("package") || text.includes("shipment") || ORDER_REFERENCE_RE.test(instruction);
  if (!mentionsOrderContext) return false;
  if (!hasPhrase(text, ORDER_STATUS_PHRASES)) return false;
  if (hasMutativePlanningSignals(instruction)) return false;
  return true;
}

function looksLikeCreateOrderIntent(instruction: string): boolean {
  const text = instruction.toLowerCase();
  if (!text.includes("order")) return false;
  return /\b(create|place|make)\b/.test(text);
}

export function selectToolNamesForInstruction(
  ctx: AgentContext,
  instruction: string
): string[] | null {
  if (!isOperatorChannel(ctx.thread.channelType)) return null;

  if (looksLikeCreateOrderIntent(instruction)) {
    const allowed = ["search_shopify_products"];
    if (!EMAIL_RE.test(instruction)) {
      allowed.push("search_shopify_customers", "get_shopify_customer");
    }
    allowed.push("create_shopify_order");
    return allowed;
  }

  if (!looksLikeOrderStatusIntent(instruction)) return null;

  const allowed = new Set<string>();

  if (ORDER_REFERENCE_RE.test(instruction)) {
    allowed.add("get_order_by_name");
    allowed.add("get_order_tracking");
    return [...allowed];
  }

  if (!ctx.thread.shopifyCustomerId) {
    allowed.add("search_shopify_customers");
  }

  allowed.add("get_shopify_orders");
  allowed.add("get_order_tracking");

  return [...allowed];
}

const SHIPPING_COVERAGE_QUESTION_RES: readonly RegExp[] = [
  /\b(do you|can you|will you|are you)\b[^.?!]{0,48}\b(ship|deliver|send)\b/,
  /\bship(?:ping|s)?\s+(?:to|internationally|worldwide|globally|outside|overseas)\b/,
  /\b(international|worldwide|global|overseas)\b[^.?!]{0,40}\b(ship|deliver|order|shopping|sales)\b/,
  /\bshopping\s+globally\b/,
  /\bship\s+to\s+[a-z]{3,}/i,
];

const DISCOUNT_POLICY_QUESTION_RES: readonly RegExp[] = [
  /\b(student|military|first.?time|loyalty|bulk|volume)\s+discount\b/i,
  /\boffer\s+(any|a)\s+(student|bulk|volume)\s+discount\b/i,
];

// A request to ship/send the customer's own order or parcel is an order operation
// (address change / reship), not a coverage question the merchant must answer. The
// possessive ("my order", "send it to ...") is what separates it from a general coverage
// question ("do you ship to Canada"), which has no such object.
const SHIPPING_ACTION_REQUEST_RES: readonly RegExp[] = [
  /\b(?:ship|send|deliver|mail|reship|resend)\b[^.?!]{0,20}\b(?:my|our|this|the)\b[^.?!]{0,16}\b(?:order|package|parcel|shipment|delivery|item|items)\b/,
  /\b(?:ship|send|deliver|mail|reship|resend)\s+(?:it|this|them|that)\s+to\b/,
];

/** Informational store-policy questions the merchant must answer when KB has no coverage. */
export function hasMerchantPolicyGapIntent(...texts: string[]): boolean {
  return texts.some((text) => {
    const lower = text.toLowerCase();
    // A message about a specific order (e.g. "can you ship order #1032 to ...") is an order
    // operation, not a general policy question the merchant must answer - never force ask_operator
    // for it. Mirrors the order-reference bail in isInformationalReturnQuestion.
    if (ORDER_REFERENCE_RE.test(text)) return false;
    if (hasOutOfScopeCommercialRequestSignals(text)) return false;
    if (isInformationalReturnQuestion(text)) return true;
    // A no-order-ref shipping action ("can you ship my order to <new address>") trips the
    // broad shipping-coverage regex below; bail so the guard never force-asks the operator
    // on an order operation. Mirrors the order-reference bail above.
    if (SHIPPING_ACTION_REQUEST_RES.some((re) => re.test(lower))) return false;
    if (SHIPPING_COVERAGE_QUESTION_RES.some((re) => re.test(lower))) return true;
    return DISCOUNT_POLICY_QUESTION_RES.some((re) => re.test(lower));
  });
}
