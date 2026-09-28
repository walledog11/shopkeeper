import { APPROVAL_LINE_ITEM_CHANGES, type ApprovalLineItem } from "./tools/registry/types.js";

/**
 * How an approval card names what a write will do, from the approval facts the
 * planner bound from Shopify: the items a line-item write targets, and the
 * refund a cancellation makes. Both the dashboard and the phone card render
 * through here, so the two cannot describe one proposal differently. A proposal
 * without bound facts renders as it did before.
 */

function isApprovalLineItem(value: unknown): value is ApprovalLineItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.name === "string"
    && item.name.trim().length > 0
    && typeof item.quantity === "number"
    && typeof item.change === "string"
    && (APPROVAL_LINE_ITEM_CHANGES as readonly string[]).includes(item.change);
}

function approvalLineItems(input: unknown): ApprovalLineItem[] {
  if (!input || typeof input !== "object") return [];
  const items = (input as { approval_line_items?: unknown }).approval_line_items;
  return Array.isArray(items) ? items.filter(isApprovalLineItem) : [];
}

function listItems(items: readonly ApprovalLineItem[]): string {
  return items.map((item) => `${item.quantity}x ${item.name.trim()}`).join(", ");
}

/** A partial refund's or cancellation's Shopify quote as the card shows it: "$8.50", or "EUR 8.50". */
export function formatApprovalQuote(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const { approval_amount: amount, approval_currency: rawCurrency } = input as Record<string, unknown>;
  if (typeof amount !== "string" && typeof amount !== "number") return null;
  const normalized = String(amount).replace(/^\$/, "").trim();
  if (!normalized) return null;
  const currency = typeof rawCurrency === "string" ? rawCurrency.trim().toUpperCase() : "";
  return `${currency && currency !== "USD" ? `${currency} ` : "$"}${normalized}`;
}

/**
 * The step as one sentence naming its items, e.g. "Refund $8.50 for 1x Linen
 * Napkin - Special". Null when the proposal carries no bound items.
 */
export function lineItemWriteSentence(tool: string, input: unknown): string | null {
  const items = approvalLineItems(input);
  const of = (change: ApprovalLineItem["change"]) => listItems(items.filter((item) => item.change === change));
  switch (tool) {
    case "create_partial_refund": {
      const refunded = of("refund");
      if (!refunded) return null;
      const quote = formatApprovalQuote(input);
      return quote ? `Refund ${quote} for ${refunded}` : `Refund ${refunded}`;
    }
    case "cancel_order": {
      const quote = formatApprovalQuote(input);
      if (!quote) return null;
      const amount = (input as { approval_amount?: unknown }).approval_amount;
      return Number(amount) === 0
        ? "Cancel the order (nothing to refund)"
        : `Cancel the order and refund ${quote}`;
    }
    case "create_return": {
      const returned = of("return");
      return returned ? `Open a return for ${returned}` : null;
    }
    case "create_exchange": {
      const returned = of("return");
      const replacement = of("replacement");
      return returned && replacement ? `Exchange ${returned} for ${replacement}` : null;
    }
    case "edit_shopify_order": {
      const removed = of("remove");
      const added = of("add");
      if (removed && added) return `Swap ${removed} for ${added} on the order`;
      if (removed) return `Remove ${removed} from the order`;
      if (added) return `Add ${added} to the order`;
      return null;
    }
    default:
      return null;
  }
}
