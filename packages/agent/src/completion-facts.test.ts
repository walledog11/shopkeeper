import { describe, expect, it } from "vitest";
import { executedCompletionFacts, historicalCompletionFacts, proposedCompletionFacts } from "./completion-facts.js";

describe("completion facts", () => {
  it("keeps a proposed refund distinct from a committed refund", () => {
    expect(proposedCompletionFacts([{
      id: "refund_1",
      name: "create_refund",
      input: { order_id: "123", amount: "20", currency: "usd" },
    }])).toEqual([expect.objectContaining({
      action: "refund",
      target: { kind: "order", id: "123" },
      amount: "20.00",
      currency: "USD",
      outcome: "proposed",
      executionReference: "refund_1",
      sourceTool: "create_refund",
    })]);

    expect(executedCompletionFacts([{
      tool: "create_refund",
      toolCallId: "refund_1",
      providerOperationKey: "execution_1:refund_1",
      input: { order_id: "123", amount: "20", currency: "usd" },
      result: "Unknown: provider response was interrupted.",
      status: "unknown",
    }])).toEqual([]);
  });

  it("takes an order alias from this turn's read when context has no such order", () => {
    const calls = [
      { id: "read", name: "get_order_by_name", input: { order_name: "1031" } },
      { id: "refund", name: "create_refund", input: { order_id: "6163445514474", amount: "43.48" } },
    ];
    const readResults = {
      read: JSON.stringify({ id: "6163445514474", name: "#1031", currency: "USD" }),
    };

    expect(proposedCompletionFacts(calls, undefined, readResults)).toEqual([
      expect.objectContaining({
        action: "refund",
        target: { kind: "order", id: "6163445514474", aliases: ["#1031"] },
      }),
    ]);
    expect(proposedCompletionFacts(calls)).toEqual([
      expect.objectContaining({ target: { kind: "order", id: "6163445514474" } }),
    ]);
  });

  it("carries the order alias through execution as well as proposal", () => {
    // The approved plan is only half the round trip. If the executed refund
    // fact loses the alias the proposal had, the merchant approves a valid
    // plan and the completion sentence fails grading on the way out.
    const read = {
      tool: "get_order_by_name",
      toolCallId: "read",
      result: JSON.stringify({ id: "6163445514474", name: "#1031", currency: "USD" }),
      status: "success" as const,
    };
    const refund = {
      tool: "create_refund",
      toolCallId: "refund",
      input: { order_id: "6163445514474", amount: "43.48", currency: "USD" },
      result: "Refunded $43.48",
      status: "success" as const,
      receipt: {
        version: 1 as const, operationId: "op-refund", executionId: "execution-refund",
        tool: "create_refund" as const, target: { kind: "order", id: "6163445514474" },
        observedAt: "2026-10-04T21:00:00.000Z", outcome: "succeeded" as const,
        providerReference: "refund-1",
        facts: { orderId: "6163445514474", refundId: "refund-1", amount: "43.48", currency: "USD",
          transactionStatus: "SUCCESS", transactionReference: "transaction-1", classification: "partial" as const },
      },
    };

    expect(executedCompletionFacts(
      [read, refund],
      undefined,
    )).toContainEqual(
      expect.objectContaining({
        action: "refund",
        outcome: "success",
        target: { kind: "order", id: "6163445514474", aliases: ["#1031"] },
      }),
    );
  });

  it("does not infer a cancellation or refund from historical result text", () => {
    for (const financialStatus of ["paid", "refunded"]) {
      expect(executedCompletionFacts([{
        tool: "cancel_order", input: { order_id: "123" }, status: "success",
        result: `Order cancelled successfully. Refund status: financial_status "${financialStatus}".`,
      }])).toEqual([]);
    }
  });

  it("uses observed receipt money rather than requested money or result wording", () => {
    const receipt = {
      version: 1 as const,
      operationId: "operation-1",
      executionId: "execution-1",
      tool: "create_refund" as const,
      target: { kind: "order", id: "123" },
      observedAt: "2026-09-12T07:00:00.000Z",
      outcome: "succeeded" as const,
      providerReference: "refund-1",
      facts: {
        orderId: "123",
        refundId: "refund-1",
        amount: "40.00",
        currency: "USD",
        transactionStatus: "SUCCESS",
        transactionReference: "transaction-1",
        classification: "partial" as const,
      },
    };
    const common = {
      tool: "create_refund",
      input: { order_id: "123", amount: "50.00", currency: "USD" },
      status: "success" as const,
      receipt,
    };

    const first = executedCompletionFacts([{ ...common, result: "Refund complete." }]);
    const second = executedCompletionFacts([{ ...common, result: "Entirely different display copy." }]);
    expect(first).toEqual(second);
    expect(first).toEqual([expect.objectContaining({
      action: "refund",
      amount: "40.00",
      currency: "USD",
      outcome: "success",
      executionReference: "operation-1",
    })]);
  });

  it("uses observed gift-card money and customer rather than requested input or wording", () => {
    const common = {
      tool: "create_gift_card",
      input: { customer_id: "wrong-customer", amount: "50.00" },
      status: "success" as const,
      receipt: {
        version: 1 as const,
        operationId: "operation-gift-card-1",
        executionId: "execution-gift-card-1",
        tool: "create_gift_card" as const,
        target: { kind: "customer" as const, id: "9001" },
        observedAt: "2026-09-13T08:00:00.000Z",
        outcome: "succeeded" as const,
        providerReference: "gid://shopify/GiftCard/42",
        facts: {
          giftCardId: "gid://shopify/GiftCard/42",
          customerId: "9001",
          amount: "25.00",
          currency: "USD",
          codeSha256: "d".repeat(64),
          lastCharacters: "a1b2",
          expiresOn: null,
          notificationRequested: true as const,
        },
      },
    };

    const first = executedCompletionFacts([{ ...common, result: "Created it." }]);
    const second = executedCompletionFacts([{ ...common, result: "Different display text." }]);
    expect(first).toEqual(second);
    expect(first).toEqual([expect.objectContaining({
      action: "store_credit",
      target: { kind: "customer", id: "9001" },
      amount: "25.00",
      currency: "USD",
      outcome: "success",
      executionReference: "operation-gift-card-1",
    })]);
  });

  it("does not infer new-runtime facts when a receipt is absent", () => {
    expect(executedCompletionFacts([{
      tool: "create_refund",
      input: { order_id: "123", amount: "50.00", currency: "USD" },
      result: "Refunded $50.00",
      status: "success",
    }])).toEqual([]);
  });

  it("grounds created-order completion in the receipt instead of the requested email", () => {
    const common = {
      tool: "create_shopify_order",
      input: { email: "buyer@example.com" },
      status: "success" as const,
      receipt: {
        version: 1 as const,
        operationId: "operation-create-order-1",
        executionId: "execution-create-order-1",
        tool: "create_shopify_order" as const,
        target: { kind: "order", id: "4001" },
        observedAt: "2026-09-12T08:00:00.000Z",
        outcome: "succeeded" as const,
        providerReference: "4001",
        facts: {
          orderId: "4001",
          orderName: "#1042",
          operationTag: "shopkeeper-op-123456789012345678901234",
          financialStatus: "pending",
          adminUrl: "https://test-store.myshopify.com/admin/orders/4001",
          totalAmount: "25.00",
          currency: "USD",
        },
      },
    };

    const first = executedCompletionFacts([{ ...common, result: "Created it." }]);
    const second = executedCompletionFacts([{ ...common, result: "Different display text." }]);
    expect(first).toEqual(second);
    expect(first).toEqual([expect.objectContaining({
      action: "order_creation",
      target: { kind: "order", id: "4001", aliases: ["#1042"] },
      outcome: "success",
      executionReference: "operation-create-order-1",
    })]);
  });

  it("requires cancellation receipt evidence before claiming a refund", () => {
    const common = {
      version: 1 as const,
      operationId: "operation-1",
      executionId: "execution-1",
      tool: "cancel_order" as const,
      target: { kind: "order", id: "123" },
      observedAt: "2026-09-12T07:00:00.000Z",
      outcome: "succeeded" as const,
      providerReference: "cancellation-1",
    };
    const action = {
      tool: "cancel_order",
      result: "Cancelled and refunded.",
      status: "success" as const,
    };
    const paid = executedCompletionFacts([{
      ...action,
      receipt: {
        ...common,
        facts: {
          orderId: "123",
          cancelledAt: "2026-09-12T07:00:00.000Z",
          reason: "customer",
          financialStatus: "paid",
          restockResult: null,
        },
      },
    }]);
    const refunded = executedCompletionFacts([{
      ...action,
      receipt: {
        ...common,
        facts: {
          orderId: "123",
          cancelledAt: "2026-09-12T07:00:00.000Z",
          reason: "customer",
          financialStatus: "refunded",
          restockResult: null,
        },
      },
    }]);

    // The refund the cancellation recorded is the evidence, whatever status
    // Shopify reports beside it.
    const recordedRefund = executedCompletionFacts([{
      ...action,
      receipt: {
        ...common,
        facts: {
          orderId: "123",
          cancelledAt: "2026-09-12T07:00:00.000Z",
          reason: "customer",
          financialStatus: "voided",
          restockResult: null,
          refund: { amount: "49.95", currency: "USD" },
        },
      },
    }]);

    expect(paid.map((fact) => fact.action)).toEqual(["cancellation"]);
    expect(refunded.map((fact) => fact.action)).toEqual(["cancellation", "refund"]);
    expect(recordedRefund.map((fact) => fact.action)).toEqual(["cancellation", "refund"]);
  });

  it("grounds a flash sale in its receipt independently of display wording", () => {
    const receipt = {
      version: 1 as const,
      operationId: "operation-flash-sale-1",
      executionId: "execution-flash-sale-1",
      tool: "create_flash_sale" as const,
      target: { kind: "shop", id: "test-store.myshopify.com" },
      observedAt: "2026-09-13T08:00:00.000Z",
      outcome: "succeeded" as const,
      providerReference: "gid://shopify/DiscountAutomaticNode/42",
      facts: {
        flashSaleId: "gid://shopify/DiscountAutomaticNode/42",
        appliesTo: "entire_catalog" as const,
        variantIds: [],
        discountPercentage: "20",
        startsAt: "2026-09-13T08:00:00.000Z",
        endsAt: "2026-09-14T08:00:00.000Z",
        providerStatus: "ACTIVE",
      },
    };
    const action = {
      tool: "create_flash_sale",
      input: { applies_to: "entire_catalog", discount_percentage: 50, duration_hours: 1 },
      status: "success" as const,
      receipt,
    };

    const first = executedCompletionFacts([{ ...action, result: "Sale started." }]);
    const second = executedCompletionFacts([{ ...action, result: "Entirely different display text." }]);

    expect(first).toEqual(second);
    expect(first).toEqual([{
      action: "discount",
      sourceTool: "create_flash_sale",
      outcome: "success",
      executionReference: "operation-flash-sale-1",
    }]);
  });

  it("grounds an ended flash sale only in its receipt", () => {
    const receipt = {
      version: 1 as const,
      operationId: "operation-end-sale-1",
      executionId: "execution-end-sale-1",
      tool: "end_flash_sale" as const,
      target: { kind: "discount", id: "gid://shopify/DiscountAutomaticNode/42" },
      observedAt: "2026-09-14T08:00:00.000Z",
      outcome: "succeeded" as const,
      providerReference: "gid://shopify/DiscountAutomaticNode/42",
      facts: {
        flashSaleId: "gid://shopify/DiscountAutomaticNode/42",
        confirmation: "deleted" as const,
      },
    };
    const action = {
      tool: "end_flash_sale",
      input: { flash_sale_id: "gid://shopify/DiscountAutomaticNode/999" },
      status: "success" as const,
      receipt,
    };

    const first = executedCompletionFacts([{ ...action, result: "Sale ended." }]);
    const second = executedCompletionFacts([{ ...action, result: "Different display text." }]);

    expect(first).toEqual(second);
    expect(first).toEqual([{
      action: "discount",
      sourceTool: "end_flash_sale",
      outcome: "success",
      executionReference: "operation-end-sale-1",
    }]);
  });

  it("grounds a variant reprice in observed receipt batches, not display text", () => {
    const receipt = {
      version: 1 as const,
      operationId: "operation-reprice-1",
      executionId: "execution-reprice-1",
      tool: "set_variant_prices" as const,
      target: { kind: "shop", id: "test-store.myshopify.com" },
      observedAt: "2026-09-14T09:00:00.000Z",
      outcome: "unknown" as const,
      code: "partial",
      providerReference: "test-store.myshopify.com",
      facts: {
        currency: "USD",
        batches: [{
          productId: "gid://shopify/Product/1",
          outcome: "succeeded" as const,
          confirmation: "mutation_response" as const,
          changes: [{
            productId: "gid://shopify/Product/1",
            variantId: "gid://shopify/ProductVariant/1",
            originalPrice: "48.00",
            requestedPrice: "44.00",
            observedPrice: "44.00",
          }],
        }, {
          productId: "gid://shopify/Product/2",
          outcome: "unknown" as const,
          confirmation: "read_after_ambiguous_response" as const,
          changes: [{
            productId: "gid://shopify/Product/2",
            variantId: "gid://shopify/ProductVariant/2",
            originalPrice: "48.00",
            requestedPrice: "44.00",
            observedPrice: null,
          }],
        }],
      },
    };
    const action = {
      tool: "set_variant_prices",
      input: { prices: "invented=1.00" },
      status: "unknown" as const,
      receipt,
    };

    const first = executedCompletionFacts([{ ...action, result: "One batch committed." }]);
    const second = executedCompletionFacts([{ ...action, result: "Completely different text." }]);

    expect(first).toEqual(second);
    expect(first).toEqual([{
      action: "price_update",
      sourceTool: "set_variant_prices",
      outcome: "unknown",
      executionReference: "operation-reprice-1",
    }]);
  });

  it("turns only successful live order reads into historical facts", () => {
    const calls = [{ id: "read_1", name: "get_order_by_name", input: { order_name: "#1001" } }];
    expect(historicalCompletionFacts(calls, {
      read_1: JSON.stringify({
        id: "123",
        name: "#1001",
        financial_status: "refunded",
        fulfillment_status: "fulfilled",
        total_price: "20.00",
        currency: "USD",
      }),
    })).toEqual([
      expect.objectContaining({ action: "refund", outcome: "success", executionReference: "read:read_1" }),
      expect.objectContaining({ action: "fulfillment", outcome: "success", executionReference: "read:read_1" }),
    ]);
    expect(historicalCompletionFacts(calls, { read_1: "No order found." })).toEqual([]);
  });
});
