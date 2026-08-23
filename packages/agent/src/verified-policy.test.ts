import { describe, expect, it } from "vitest";
import type { AgentContext, VerifiedOrderRef } from "./agent-context.js";
import {
  GUEST_TOOL_NAMES,
  VERIFIED_TOOL_NAMES,
  isStorefrontContext,
  isVerifiedAllowedTool,
  isVerifiedContext,
  storefrontToolNames,
} from "./guest-policy.js";
import { resolveAgentSettings, type AutonomyTier } from "./settings.js";
import { TOOL_DEFINITIONS, selectAgentTools } from "./tools/registry/index.js";
import { checkStaticToolPolicy } from "./tools/static-policy.js";

const ORDER: VerifiedOrderRef = { orderName: "#1025", orderId: "5678901234" };
const OTHER: VerifiedOrderRef = { orderName: "#1026", orderId: "9999999999" };

const VERIFIED = { authState: "verified" as const, verifiedOrders: [ORDER] };

// Everything a verified shopper must still never reach. Verification unlocks
// seeing one order — not an account, and not a single mutation. Listed by name
// rather than derived, so widening the allowlist cannot silently delete its own
// test.
const FORBIDDEN_WHEN_VERIFIED = [
  // Customer-wide reads: this session proved control of an order, not an account.
  "get_shopify_orders",
  "find_customer",
  "search_shopify_customers",
  "get_shopify_customer",
  // Mutations, in full — the same list a guest is refused.
  "create_refund",
  "cancel_order",
  "create_shopify_order",
  "edit_shopify_order",
  "update_shopify_order_address",
  "issue_discount",
  "create_return",
  "create_exchange",
  "issue_store_credit",
  "create_gift_card",
  "attach_return_label",
  "fulfill_order",
  "update_shopify_customer_info",
  "add_shopify_customer_note",
  // Unverified address, merchant's business — unchanged from guest.
  "send_email",
  "get_support_stats",
] as const;

const TIERS: AutonomyTier[] = ["watch", "guarded", "trusted", "broad", "full"];

function check(name: string, args: Record<string, unknown>, opts = VERIFIED) {
  return checkStaticToolPolicy(name, args, resolveAgentSettings({}), opts);
}

describe("verified storefront policy", () => {
  it("classifies every registry tool as allowed or forbidden", () => {
    const classified = new Set<string>([...VERIFIED_TOOL_NAMES, ...FORBIDDEN_WHEN_VERIFIED]);
    const unclassified = TOOL_DEFINITIONS.map((d) => d.name).filter((n) => !classified.has(n));
    expect(unclassified).toEqual([]);
  });

  it("is the guest set plus the two order reads and nothing else", () => {
    const added = VERIFIED_TOOL_NAMES.filter((n) => !GUEST_TOOL_NAMES.includes(n as never));
    expect([...added].sort()).toEqual(["get_order_by_name", "get_order_tracking"]);
  });

  it("refuses every forbidden tool at every autonomy tier", () => {
    for (const tier of TIERS) {
      for (const name of FORBIDDEN_WHEN_VERIFIED) {
        const result = checkStaticToolPolicy(name, {}, resolveAgentSettings({ autonomyTier: tier }), VERIFIED);
        expect(result.blocked, `${name} at ${tier}`).toBe(true);
      }
    }
  });

  it("allows a read of the order this session verified", () => {
    expect(check("get_order_by_name", { order_name: "#1025" }).blocked).toBe(false);
    expect(check("get_order_tracking", { order_id: "5678901234" }).blocked).toBe(false);
  });

  it("normalizes the order reference, so '1025' and '#1025' are the same order", () => {
    expect(check("get_order_by_name", { order_name: "1025" }).blocked).toBe(false);
    expect(check("get_order_by_name", { order_name: " #1025 " }).blocked).toBe(false);
  });

  // The core scoping property: proving control of one order must not hand over
  // the shop's order book by number.
  it("refuses a read of an order this session did NOT verify", () => {
    const byName = check("get_order_by_name", { order_name: "#1026" });
    expect(byName.blocked).toBe(true);
    expect(byName.blocked && byName.reason).toContain("has not confirmed");

    expect(check("get_order_tracking", { order_id: "9999999999" }).blocked).toBe(true);
  });

  it("scopes to each verified order independently when a session has several", () => {
    const both = { authState: "verified" as const, verifiedOrders: [ORDER, OTHER] };
    expect(check("get_order_by_name", { order_name: "#1025" }, both).blocked).toBe(false);
    expect(check("get_order_by_name", { order_name: "#1026" }, both).blocked).toBe(false);
    expect(check("get_order_by_name", { order_name: "#1027" }, both).blocked).toBe(true);
  });

  it("refuses order reads when the state says verified but no orders are carried", () => {
    const empty = { authState: "verified" as const, verifiedOrders: [] };
    expect(check("get_order_by_name", { order_name: "#1025" }, empty).blocked).toBe(true);
  });

  it("keeps the shipping-status tool, which needs no verification", () => {
    expect(check("get_order_fulfillment_status", { order_number: "#1099" }).blocked).toBe(false);
  });

  it("selects the verified allowlist for planning and running", () => {
    expect(storefrontToolNames(VERIFIED)).toBe(VERIFIED_TOOL_NAMES);
    const selected = selectAgentTools(resolveAgentSettings({}), storefrontToolNames(VERIFIED)!);
    expect(selected.map((t) => t.name).sort()).toEqual([...VERIFIED_TOOL_NAMES].sort());
  });

  it("treats verified as a storefront context, so the guest prompt and routing still apply", () => {
    expect(isVerifiedContext(VERIFIED)).toBe(true);
    expect(isStorefrontContext(VERIFIED)).toBe(true);
    expect(isStorefrontContext({ authState: "guest" })).toBe(true);
    expect(isStorefrontContext({} as AgentContext)).toBe(false);
  });

  it("leaves every other channel untouched", () => {
    expect(storefrontToolNames({} as AgentContext)).toBeNull();
    expect(isVerifiedAllowedTool("create_refund")).toBe(false);
    // No auth state: the order read that a verified session scopes is unscoped
    // on email, exactly as it has always been.
    const email = checkStaticToolPolicy(
      "get_order_by_name",
      { order_name: "#4242" },
      resolveAgentSettings({}),
      {},
    );
    expect(email.blocked).toBe(false);
  });
});
