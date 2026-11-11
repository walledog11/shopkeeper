import { describe, expect, it } from "vitest";
import { deriveShopifyBillingState } from "./billing.js";

// The status decides whether the billing gate stops writes, so a stray older
// subscription must never outvote the plan the store is on.

function subscription(status: string, extra: Partial<{ name: string; trialDays: number; createdAt: string; test: boolean }> = {}) {
  return {
    id: `gid://shopify/AppSubscription/${status}`,
    name: extra.name ?? "Pro",
    status,
    test: extra.test ?? false,
    trialDays: extra.trialDays ?? 0,
    createdAt: extra.createdAt ?? "2026-11-01T00:00:00Z",
  };
}

describe("deriveShopifyBillingState", () => {
  it("reads the active plan over an older cancelled one", () => {
    const state = deriveShopifyBillingState([
      subscription("ACTIVE", { name: "Pro", trialDays: 14, createdAt: "2026-11-01T00:00:00Z" }),
      subscription("CANCELLED", { name: "Starter" }),
    ]);
    expect(state).toMatchObject({ status: "active", planName: "Pro" });
    expect(state.trialEndsAt?.toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });

  it("marks a frozen store and a plan that ended", () => {
    expect(deriveShopifyBillingState([subscription("FROZEN")]).status).toBe("frozen");
    expect(deriveShopifyBillingState([subscription("CANCELLED")]).status).toBe("inactive");
    expect(deriveShopifyBillingState([subscription("EXPIRED")]).status).toBe("inactive");
  });

  it("treats a store that never ran a plan as having none", () => {
    expect(deriveShopifyBillingState([]).status).toBeNull();
    expect(deriveShopifyBillingState([subscription("DECLINED")]).status).toBeNull();
    expect(deriveShopifyBillingState([subscription("PENDING")]).status).toBeNull();
  });
});
