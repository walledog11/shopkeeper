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

// What a storefront shopper reaches once they have proven control of the address
// on an order. The guest set plus the fuller reads for *that order* — and
// nothing else. Verification unlocks seeing your own order; it never unlocks
// mutating one, so cancel, edit, refund and address change stay absent here
// exactly as they are for a guest and continue to escalate.
//
// `get_shopify_orders` and `search_shopify_customers` are deliberately out:
// both are customer-wide, and this session proved control of an order, not of
// an account. Widening from one to the other is the M2 question.
const VERIFIED_ORDER_TOOL_NAMES = ["get_order_by_name", "get_order_tracking"] as const;

export const VERIFIED_TOOL_NAMES = [
  ...GUEST_TOOL_NAMES,
  ...VERIFIED_ORDER_TOOL_NAMES,
] as const;

const VERIFIED_TOOL_SET: ReadonlySet<string> = new Set(VERIFIED_TOOL_NAMES);
// The tools whose target must be checked against this session's verified orders.
// Being in the verified tool set is necessary but not sufficient: holding a
// verified session for #1025 must not answer a question about #1026.
const ORDER_SCOPED_TOOL_SET: ReadonlySet<string> = new Set(VERIFIED_ORDER_TOOL_NAMES);

export function isGuestContext(ctx: Pick<BaseAgentContext, "authState"> | null | undefined): boolean {
  return ctx?.authState === "guest";
}

export function isVerifiedContext(
  ctx: Pick<BaseAgentContext, "authState"> | null | undefined,
): boolean {
  return ctx?.authState === "verified";
}

// True for both storefront states. Every branch that exists because the visitor
// arrived anonymously — the prompt section, the escalation keepReply flag, the
// planning-warning exemption — applies to a verified shopper too: they are still
// someone on the website with no customer record behind them.
export function isStorefrontContext(
  ctx: Pick<BaseAgentContext, "authState"> | null | undefined,
): boolean {
  return isGuestContext(ctx) || isVerifiedContext(ctx);
}

// The allowlist to plan and run against for a storefront thread, or null for
// every other channel — where tool selection is settings-driven as it always
// has been. One function so the planner and the run loop cannot disagree about
// what a verified shopper holds.
export function storefrontToolNames(
  ctx: Pick<BaseAgentContext, "authState"> | null | undefined,
): readonly string[] | null {
  if (isVerifiedContext(ctx)) return VERIFIED_TOOL_NAMES;
  if (isGuestContext(ctx)) return GUEST_TOOL_NAMES;
  return null;
}

export function isStorefrontAllowedTool(
  ctx: Pick<BaseAgentContext, "authState"> | null | undefined,
  name: string,
): boolean {
  if (isVerifiedContext(ctx)) return isVerifiedAllowedTool(name);
  if (isGuestContext(ctx)) return isGuestAllowedTool(name);
  return true;
}

export function isGuestAllowedTool(name: string): boolean {
  return GUEST_TOOL_SET.has(name);
}

export function isVerifiedAllowedTool(name: string): boolean {
  return VERIFIED_TOOL_SET.has(name);
}

export function isOrderScopedTool(name: string): boolean {
  return ORDER_SCOPED_TOOL_SET.has(name);
}

export function guestToolBlockReason(name: string): string {
  return `${name} is not available in storefront chat, where the visitor is anonymous and unverified. Tell them plainly that you cannot look up order or account details here, and hand off — point them to email or escalate to the merchant.`;
}

export function verifiedToolBlockReason(name: string): string {
  return `${name} is not available in storefront chat. This visitor confirmed the email on a specific order, which lets you read that order and nothing else — it is not an account login and it does not authorize any change. Hand this to the shop.`;
}

export function orderScopeBlockReason(name: string): string {
  return `${name} was called for an order this visitor has not confirmed. They proved control of the email on one order only; reading another order would disclose a stranger's details. Hand this to the shop.`;
}
