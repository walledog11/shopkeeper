import type { BaseAgentContext } from "./agent-context.js";

// What an anonymous storefront shopper is allowed to reach. An allowlist, not a
// denylist: a tool added to the registry tomorrow is unavailable to guests until
// someone decides otherwise, which is the failure direction we want.
//
// Everything customer-specific is absent by construction. No order reads, no
// customer reads, no Shopify mutation — not because the prompt discourages them
// but because the tools are not in the set and the executor refuses them if a
// plan names one anyway.
//
// Two exclusions worth stating, since neither is an order read or a mutation:
// `send_email` is out because a guest has no verified address — the only address
// available is one they typed, and mailing it on request turns the widget into
// an open relay aimed at strangers. `get_support_stats` is out because it
// reports the merchant's business, not the shopper's question.
export const GUEST_TOOL_NAMES = [
  // Answer from what is public: policy, FAQ, product information.
  "search_kb",
  "search_shopify_products",
  // Shipping state for an order they can name. Safe here only because it is
  // built to return no identifying detail — see getOrderFulfillmentStatus. The
  // fuller order reads stay out; those need a verified session.
  "get_order_fulfillment_status",
  // Talk back, and get a human when that is the honest answer.
  "send_reply",
  "escalate_to_human",
  "ask_operator",
  // Internal housekeeping. None of it reaches the shopper or Shopify, and
  // without it a storefront ticket cannot be tagged, noted or closed like every
  // other ticket in the inbox.
  "add_internal_note",
  "update_thread_status",
  "update_thread_tag",
] as const;

// Reachable only from a guest context. `get_order_fulfillment_status` exists
// because a storefront visitor cannot be identified; on every other channel the
// thread is already tied to a customer and the fuller order reads answer the same
// question better. Keeping it out of the support tool list is not tidiness — it
// means adding this tool leaves the support planner's tool set byte-identical,
// so the eval gate has nothing new to measure.
const GUEST_ONLY_TOOL_NAMES: ReadonlySet<string> = new Set(["get_order_fulfillment_status"]);

export function isGuestOnlyTool(name: string): boolean {
  return GUEST_ONLY_TOOL_NAMES.has(name);
}

const GUEST_TOOL_SET: ReadonlySet<string> = new Set(GUEST_TOOL_NAMES);

export function isGuestContext(ctx: Pick<BaseAgentContext, "authState"> | null | undefined): boolean {
  return ctx?.authState === "guest";
}

export function isGuestAllowedTool(name: string): boolean {
  return GUEST_TOOL_SET.has(name);
}

export function guestToolBlockReason(name: string): string {
  return `${name} is not available in storefront chat, where the visitor is anonymous and unverified. Tell them plainly that you cannot look up order or account details here, and hand off — point them to email or escalate to the merchant.`;
}
