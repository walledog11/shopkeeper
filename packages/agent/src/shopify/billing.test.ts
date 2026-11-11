import { describe, expect, it } from "vitest";
import { deriveShopifyBillingState } from "./billing.js";

// The status decides whether the billing gate stops writes. Shopify reports
// only an active plan, so an ended plan is told from one never chosen by what
// was stored before.

describe("deriveShopifyBillingState", () => {
  it("reads the active plan's handle and trial", () => {
    const state = deriveShopifyBillingState(
      { trialEndsAt: "2026-11-15T00:00:00Z", items: [{ handle: "pro" }] },
      null,
    );
    expect(state).toEqual({ status: "active", planHandle: "pro", trialEndsAt: new Date("2026-11-15T00:00:00Z") });
  });

  it("marks a plan that was active and is gone as ended", () => {
    expect(deriveShopifyBillingState(null, "active").status).toBe("inactive");
    expect(deriveShopifyBillingState(null, "inactive").status).toBe("inactive");
  });

  it("leaves a store that never had a plan without one", () => {
    expect(deriveShopifyBillingState(null, null).status).toBeNull();
  });
});
