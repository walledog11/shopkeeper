import { describe, expect, it } from "vitest";
import { resolveAgentSettings, type AutonomyTier } from "../settings.js";
import { checkStaticToolPolicy } from "./static-policy.js";

describe("deterministic compensation policy matrix", () => {
  it.each([
    ["guarded", 50],
    ["trusted", 100],
    ["broad", 250],
    ["full", 1000],
  ] as const)("applies the %s tier boundary to refunds and gift cards", (tier, cap) => {
    const settings = resolveAgentSettings({ autonomyTier: tier as AutonomyTier });

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

    expect(checkStaticToolPolicy(
      "create_refund",
      { order_id: "1001", amount: (cap + 0.01).toFixed(2), currency: "USD" },
      settings,
    )).toMatchObject({ blocked: true });
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
    const settings = resolveAgentSettings({ autonomyTier: "full" });
    const args = tool === "issue_discount"
      ? { percentage: 5 }
      : { customer_id: "501", amount: "5.00" };
    expect(checkStaticToolPolicy(tool, args, settings)).toMatchObject({
      blocked: true,
      reason: expect.stringContaining("is retired"),
    });
  });
});
