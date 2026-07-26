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

  // Recorded from palette-dev after a real storeCreditAccountCredit: the credit
  // it produces carries event ADJUSTMENT, so a probe keyed on event "CREDIT"
  // called a committed credit no_effect.
  it("commits a store credit whose event is ADJUSTMENT", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        customer: {
          storeCreditAccounts: {
            nodes: [{
              transactions: {
                nodes: [{
                  __typename: "StoreCreditAccountCreditTransaction",
                  amount: { amount: "0.01" },
                  event: "ADJUSTMENT",
                }],
              },
            }],
          },
        },
      },
    })));

    const result = await probeUnknownShopifyMutation(
      "issue_store_credit",
      { customer_id: "9071668134122", amount: "0.01" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed", spentCents: 1 });
  });

  it("does not read a store-credit debit as the credit it was asked to reconcile", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        customer: {
          storeCreditAccounts: {
            nodes: [{
              transactions: {
                nodes: [{
                  __typename: "StoreCreditAccountDebitTransaction",
                  amount: { amount: "0.01" },
                  event: "ORDER_PAYMENT",
                }],
              },
            }],
          },
        },
      },
    })));

    const result = await probeUnknownShopifyMutation(
      "issue_store_credit",
      { customer_id: "9071668134122", amount: "0.01" },
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
