import { describe, expect, it } from "vitest";
import { handleShopifySimulatorRest } from "./simulator-store.js";

describe("Shopify simulator store", () => {
  it("recognizes workspace-specific simulator domains without reaching Shopify", () => {
    const response = handleShopifySimulatorRest({ shop: "demo-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa.shopkeeper.test" }, "policies.json");
    expect(response).not.toBeNull();
    expect(handleShopifySimulatorRest({ shop: "demo-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa.shopkeeper.test" }, "orders.json")?.ok).toBe(true);
  });

  // The interceptor sits in front of every Shopify REST call, so a real shop has to fall through.
  it("does not intercept a real Shopify shop", () => {
    expect(handleShopifySimulatorRest({ shop: "example.myshopify.com" }, "orders.json")).toBeNull();
  });
});
