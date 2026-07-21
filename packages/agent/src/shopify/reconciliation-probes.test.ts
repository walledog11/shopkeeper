import { afterEach, describe, expect, it, vi } from "vitest";
import { shopifyIdempotencyKey } from "./client.js";
import { probeUnknownShopifyMutation } from "./reconciliation-probes.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
  operationId: "execution-1:refund_step",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("probeUnknownShopifyMutation", () => {
  it("commits when a matching refund exists on the order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      refunds: [{
        id: 1,
        transactions: [{ status: "success", amount: "20.00" }],
      }],
    })));

    const result = await probeUnknownShopifyMutation(
      "create_refund",
      { order_id: "456", amount: "20.00" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed", spentCents: 2000 });
  });

  it("releases cancellation reconciliation when the order is not cancelled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      order: { id: 456, name: "#1001", cancelled_at: null },
    })));

    const result = await probeUnknownShopifyMutation(
      "cancel_order",
      { order_id: "456", reason: "customer" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "no_effect" });
  });

  it("commits when a tagged order exists for the operation", async () => {
    const tag = `shopkeeper-op-${shopifyIdempotencyKey("execution-1:create_order")}`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        orders: {
          nodes: [{ legacyResourceId: "9001", name: "#1002", tags: [tag] }],
        },
      },
    })));

    const result = await probeUnknownShopifyMutation(
      "create_shopify_order",
      { email: "buyer@example.com", line_items: [{ variant_id: "1", quantity: 1 }] },
      { ...ctx, operationId: "execution-1:create_order" },
    );

    expect(result).toMatchObject({ outcome: "committed" });
  });
});
