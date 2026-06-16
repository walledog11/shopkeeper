import type { AgentContext } from "./agent-context.js";
import { isOperatorChannel } from "./thread-constants.js";

export { isOperatorChannel };

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

export const ORDER_REFERENCE_RE = /(?:#?[A-Z]{1,4}\d{3,}|\border\s*#?\s*\d{4,}\b)/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

const CUSTOMER_MUTATIVE_PHRASES = [
  "cancel",
  "refund",
  "return my order",
  "return the order",
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
