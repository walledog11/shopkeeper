import { describe, expect, it } from "vitest";
import { resolveAgentSettings } from "../settings.js";
import { checkStaticToolPolicy } from "./static-policy.js";

describe("deterministic compensation policy matrix", () => {
  it.each([
    ["guarded", 50],
    ["trusted", 100],
  ] as const)("applies the %s tier boundary to refunds and gift cards", (tier, cap) => {
    const settings = resolveAgentSettings({ autonomyTier: tier });

    expect(checkStaticToolPolicy(
      "create_refund",
      { order_id: "1001", amount: cap.toFixed(2), currency: "USD" },
      settings,
    )).toEqual({ blocked: false });
    expect(checkStaticToolPolicy(
      "create_gift_card",
      { customer_id: "501", amount: cap.toFixed(2) },
      settings,
    )).toEqual({ blocked: false });

    // A refund naming its own currency defers: this check has no order, so it
    // cannot tell a foreign amount from a shop-currency one, and blocking on
    // the assumption is what refused an ordinary 59.90 CAD refund against a
    // limit of 50 dollars. Over-cap plans still reach a human —
    // `planExceedsCompensationCap` escalates them at planning time and
    // `createRefund` re-judges against the shop's own figure at execution.
    for (const currency of ["USD", "CAD"]) {
      expect(checkStaticToolPolicy(
        "create_refund",
        { order_id: "1001", amount: (cap + 0.01).toFixed(2), currency },
        settings,
      )).toEqual({ blocked: false });
    }

    // With no currency on the claim there is nothing to be foreign, so the cap
    // is comparable and this is the one refund shape still judged here.
    expect(checkStaticToolPolicy(
      "create_refund",
      { order_id: "1001", amount: (cap + 0.01).toFixed(2) },
      settings,
    )).toMatchObject({ blocked: true });

    // Amounts `Number` accepts that are no kind of money must not throw out of
    // a check that also runs in the client bundle.
    for (const amount of ["5000.999", "1e3", "20."]) {
      expect(() => checkStaticToolPolicy(
        "create_refund",
        { order_id: "1001", amount },
        settings,
      )).not.toThrow();
    }

    // Gift cards carry no currency field at all: shop money by construction,
    // always comparable, and this is their only cap enforcement.
    expect(checkStaticToolPolicy(
      "create_gift_card",
      { customer_id: "501", amount: (cap + 0.01).toFixed(2) },
      settings,
    )).toMatchObject({ blocked: true });
  });

  it("blocks compensation in watch mode and requires gift-card delivery identity", () => {
    const settings = resolveAgentSettings({ autonomyTier: "watch" });
    expect(checkStaticToolPolicy(
      "create_refund",
      { order_id: "1001", amount: "1.00", currency: "USD" },
      settings,
    )).toMatchObject({ blocked: true });

    const guarded = resolveAgentSettings({ autonomyTier: "guarded" });
    expect(checkStaticToolPolicy("create_gift_card", { amount: "20.00" }, guarded)).toMatchObject({
      blocked: true,
      reason: expect.stringContaining("customer_id is required"),
    });
  });

  it.each(["issue_discount", "issue_store_credit"])("always blocks retired tool %s", tool => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted" });
    const args = tool === "issue_discount"
      ? { percentage: 5 }
      : { customer_id: "501", amount: "5.00" };
    expect(checkStaticToolPolicy(tool, args, settings)).toMatchObject({
      blocked: true,
      reason: expect.stringContaining("is retired"),
    });
  });
});
