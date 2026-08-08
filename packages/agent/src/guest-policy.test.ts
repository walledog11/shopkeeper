import { describe, expect, it } from "vitest";
import { GUEST_TOOL_NAMES, isGuestAllowedTool, isGuestContext } from "./guest-policy.js";
import { resolveAgentSettings, type AutonomyTier } from "./settings.js";
import { TOOL_DEFINITIONS, selectAgentTools } from "./tools/registry/index.js";
import { checkStaticToolPolicy } from "./tools/static-policy.js";

const GUEST = { authState: "guest" as const };

// Every tool a guest must never reach, listed by name rather than derived from
// the allowlist — so that adding a tool to the allowlist cannot silently delete
// its own test.
const FORBIDDEN_FOR_GUESTS = [
  // Order reads: the disclosure surface this milestone exists to close.
  "get_shopify_orders",
  "get_order_by_name",
  "get_order_tracking",
  // Customer reads.
  "search_shopify_customers",
  "get_shopify_customer",
  // Mutations, in full.
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
  // Not an order read, still not a guest's business.
  "send_email",
  "get_support_stats",
] as const;

describe("guest state", () => {
  it("is only set by an explicit guest auth state", () => {
    expect(isGuestContext(GUEST)).toBe(true);
    expect(isGuestContext({})).toBe(false);
    expect(isGuestContext(null)).toBe(false);
    expect(isGuestContext(undefined)).toBe(false);
  });
});

describe("guest allowlist", () => {
  it("covers every registered tool: allowed or forbidden, nothing unclassified", () => {
    const classified = new Set<string>([...GUEST_TOOL_NAMES, ...FORBIDDEN_FOR_GUESTS]);
    const unclassified = TOOL_DEFINITIONS
      .map((definition) => definition.name)
      .filter((name) => !classified.has(name));

    // A new tool lands here until someone decides which side it belongs on.
    expect(unclassified).toEqual([]);
  });

  it("allows only knowledge, public product info, replying, escalation and internal housekeeping", () => {
    expect([...GUEST_TOOL_NAMES]).toEqual([
      "search_kb",
      "search_shopify_products",
      "send_reply",
      "escalate_to_human",
      "ask_operator",
      "add_internal_note",
      "update_thread_status",
      "update_thread_tag",
    ]);
  });

  it.each(FORBIDDEN_FOR_GUESTS)("refuses %s", (name) => {
    expect(isGuestAllowedTool(name)).toBe(false);
  });
});

describe("guest tool selection", () => {
  it("hands the model no order, customer or mutative tool", () => {
    const selected = selectAgentTools(resolveAgentSettings({}), GUEST_TOOL_NAMES).map((tool) => tool.name);

    for (const forbidden of FORBIDDEN_FOR_GUESTS) {
      expect(selected).not.toContain(forbidden);
    }
    expect(selected).toContain("search_kb");
    expect(selected).toContain("send_reply");
    expect(selected).toContain("escalate_to_human");
  });
});

describe("guest static policy", () => {
  // The backstop: even a plan that names a forbidden tool — a stale cached plan,
  // or one crafted by prompt injection in the shopper's own message — is refused
  // at execution, not merely absent from the tool list.
  it.each(FORBIDDEN_FOR_GUESTS)("blocks %s at execution even when named directly", (name) => {
    const result = checkStaticToolPolicy(name, {}, resolveAgentSettings({}), GUEST);

    expect(result.blocked).toBe(true);
    expect(result).toMatchObject({ reason: expect.stringContaining("storefront chat") });
  });

  it("blocks a refund inside every autonomy tier, including full", () => {
    for (const tier of ["watch", "guarded", "trusted", "broad", "full"] as const) {
      const settings = resolveAgentSettings({ autonomyTier: tier as AutonomyTier });
      expect(checkStaticToolPolicy(
        "create_refund",
        { order_id: "1001", amount: "1.00", currency: "USD" },
        settings,
        GUEST,
      )).toMatchObject({ blocked: true });
    }
  });

  it("blocks an order lookup no matter how convincing the shopper's claim", () => {
    // The case the plan calls out: a real order number and a real email address,
    // supplied by someone asserting they own them. Neither is authentication.
    expect(checkStaticToolPolicy(
      "get_order_by_name",
      { name: "#1018" },
      resolveAgentSettings({}),
      GUEST,
    )).toMatchObject({ blocked: true });
    expect(checkStaticToolPolicy(
      "search_shopify_customers",
      { query: "owner@example.com" },
      resolveAgentSettings({}),
      GUEST,
    )).toMatchObject({ blocked: true });
  });

  it("still allows what the guest chat is for", () => {
    const settings = resolveAgentSettings({});

    expect(checkStaticToolPolicy("search_kb", { query: "return policy" }, settings, GUEST)).toEqual({ blocked: false });
    expect(checkStaticToolPolicy("search_shopify_products", { query: "mug" }, settings, GUEST)).toEqual({ blocked: false });
    expect(checkStaticToolPolicy("send_reply", { text: "Here's our policy." }, settings, GUEST)).toEqual({ blocked: false });
    expect(checkStaticToolPolicy("escalate_to_human", { reason: "wants order help" }, settings, GUEST)).toEqual({ blocked: false });
  });

  it("changes nothing without the guest state", () => {
    const settings = resolveAgentSettings({});

    for (const name of FORBIDDEN_FOR_GUESTS) {
      // No auth state at all: the same call the email/IG/operator channels make.
      const withoutState = checkStaticToolPolicy(name, {}, settings);
      expect(checkStaticToolPolicy(name, {}, settings, {})).toEqual(withoutState);
      // …and whatever it says, it is never the guest refusal.
      if (withoutState.blocked) {
        expect(withoutState.reason).not.toContain("storefront chat");
      }
    }
    // A real order lookup on a normal channel stays available.
    expect(checkStaticToolPolicy(
      "get_order_by_name",
      { order_name: "#1018" },
      settings,
    )).toEqual({ blocked: false });
  });
});
