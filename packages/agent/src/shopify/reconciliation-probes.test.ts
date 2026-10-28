import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { shopifyIdempotencyKey } from "./client.js";
import { discountCodeForOperation } from "./discounts.js";
import { probeUnknownShopifyMutation } from "./reconciliation-probes/index.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
  operationId: "execution-1:refund_step",
};

const giftCardInput = { amount: "25.00", customer_id: "123" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("probeUnknownShopifyMutation", () => {
  it("commits when the deterministic discount code exists", async () => {
    const code = discountCodeForOperation(10, ctx.operationId);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        codeDiscountNodeByCode: {
          id: "gid://shopify/DiscountCodeNode/1",
          codeDiscount: { codes: { nodes: [{ code }] } },
        },
      },
    })));

    const result = await probeUnknownShopifyMutation(
      "issue_discount",
      { percentage: 10 },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed" });
    expect(result.message).toContain(code);
  });

  it("does not rule out a discount from an empty search result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: { codeDiscountNodeByCode: null },
    })));

    const result = await probeUnknownShopifyMutation(
      "issue_discount",
      { percentage: 10 },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
  });

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

    expect(result).toMatchObject({ outcome: "committed" });
  });

  it("commits a partial refund from the order's one successful refund", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      refunds: [{
        id: 1,
        transactions: [{ status: "success", amount: "16.00" }],
      }],
    })));

    // A partial refund's amount is priced at execution, so its input names none.
    const result = await probeUnknownShopifyMutation(
      "create_partial_refund",
      { order_id: "456", items: [{ line_item_id: "9001", quantity: 1 }] },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed" });
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

  const giftCardOperationId = "execution-1:gift_card";

  const giftCardCode = shopifyIdempotencyKey(giftCardOperationId).replaceAll("-", "").slice(0, 20);

  it("commits a gift card carrying the operation code and amount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        giftCards: {
          nodes: [{
            id: "gid://shopify/GiftCard/1",
            initialValue: { amount: "25.00" },
            note: `Shopkeeper operation: ${giftCardCode}`,
          }],
        },
      },
    })));

    const result = await probeUnknownShopifyMutation(
      "create_gift_card",
      giftCardInput,
      { ...ctx, operationId: giftCardOperationId },
    );

    expect(result).toMatchObject({ outcome: "committed", spentCents: 2500 });
  });

  // The code is per-operation, so an unrelated card of the same value is not
  // this operation's card.
  it("does not read another gift card of the same value as this operation's", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          giftCards: {
            nodes: [{
              id: "gid://shopify/GiftCard/2",
              initialValue: { amount: "25.00" },
              note: "Goodwill for a late delivery",
            }],
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ data: { giftCards: { nodes: [] } } })));

    const result = await probeUnknownShopifyMutation(
      "create_gift_card",
      giftCardInput,
      { ...ctx, operationId: giftCardOperationId },
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
  });

  it("falls back to recent cards when Shopify code search misses a committed card", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { giftCards: { nodes: [] } } }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          giftCards: {
            nodes: [{
              id: "gid://shopify/GiftCard/1",
              initialValue: { amount: "25.00" },
              note: `Shopkeeper operation: ${giftCardCode}`,
              lastCharacters: giftCardCode.slice(-4),
            }],
          },
        },
      })));

    const result = await probeUnknownShopifyMutation(
      "create_gift_card",
      giftCardInput,
      { ...ctx, operationId: giftCardOperationId },
    );

    expect(result).toMatchObject({ outcome: "committed", spentCents: 2500 });
  });

  it("cannot reconcile a gift card without a stable operation identity", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeUnknownShopifyMutation(
      "create_gift_card",
      giftCardInput,
      { ...ctx, operationId: undefined },
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays unknown when multiple successful refunds match the requested amount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      refunds: [
        { id: 1, transactions: [{ status: "success", amount: "20.00" }] },
        { id: 2, transactions: [{ status: "success", amount: "20.00" }] },
      ],
    })));

    const result = await probeUnknownShopifyMutation(
      "create_refund",
      { order_id: "456", amount: "20.00" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(result.message).toContain("Multiple successful refunds");
  });

  it("rules out a refund when no successful refund matches the requested amount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      refunds: [{
        id: 1,
        transactions: [{ status: "pending", amount: "20.00" }],
      }],
    })));

    const result = await probeUnknownShopifyMutation(
      "create_refund",
      { order_id: "456", amount: "20.00" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "no_effect" });
  });

  it("commits a cancellation when the cancel reason matches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      order: { id: 456, name: "#1001", cancelled_at: "2026-08-01T00:00:00Z", cancel_reason: "customer" },
    })));

    const result = await probeUnknownShopifyMutation(
      "cancel_order",
      { order_id: "456", reason: "customer" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed" });
  });

  it("stays unknown when the order is cancelled with a different reason", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      order: { id: 456, name: "#1001", cancelled_at: "2026-08-01T00:00:00Z", cancel_reason: "fraud" },
    })));

    const result = await probeUnknownShopifyMutation(
      "cancel_order",
      { order_id: "456", reason: "customer" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(result.message).toContain("fraud");
  });

  it("reports still_unknown for tools without a reconciliation probe", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeUnknownShopifyMutation("search_kb", { query: "returns" }, ctx);

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(result.message).toContain("does not have a Shopify reconciliation probe");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wraps probe failures as still_unknown instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await probeUnknownShopifyMutation(
      "create_refund",
      { order_id: "456", amount: "20.00" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(result.message).toContain("reconciliation probe failed");
  });

  it("cannot reconcile a discount without a stable operation identity", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeUnknownShopifyMutation(
      "issue_discount",
      { percentage: 10 },
      { ...ctx, operationId: undefined },
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cannot reconcile a discount without a finite percentage", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeUnknownShopifyMutation(
      "issue_discount",
      { percentage: Number.NaN },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays unknown when multiple gift cards match the operation code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        giftCards: {
          nodes: [
            {
              id: "gid://shopify/GiftCard/1",
              initialValue: { amount: "25.00" },
              note: `Shopkeeper operation: ${giftCardCode}`,
            },
            {
              id: "gid://shopify/GiftCard/2",
              initialValue: { amount: "25.00" },
              note: `Shopkeeper operation: ${giftCardCode}`,
            },
          ],
        },
      },
    })));

    const result = await probeUnknownShopifyMutation(
      "create_gift_card",
      giftCardInput,
      { ...ctx, operationId: giftCardOperationId },
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(result.message).toContain("Multiple gift cards");
  });

  it("stays unknown when multiple store-credit transactions match the amount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        customer: {
          storeCreditAccounts: {
            nodes: [{
              transactions: {
                nodes: [
                  {
                    __typename: "StoreCreditAccountCreditTransaction",
                    amount: { amount: "0.01" },
                  },
                  {
                    __typename: "StoreCreditAccountCreditTransaction",
                    amount: { amount: "0.01" },
                  },
                ],
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

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(result.message).toContain("Multiple store-credit transactions");
  });
});
