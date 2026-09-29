import { describe, expect, it } from "vitest";
import { handleShopifySimulatorRest } from "./simulator-store.js";

describe("Shopify simulator store", () => {
  // The interceptor sits in front of every Shopify REST call, so a real shop has to fall through.
  it("does not intercept a real Shopify shop", () => {
    expect(handleShopifySimulatorRest({ shop: "example.myshopify.com" }, "orders.json")).toBeNull();
  });
});
