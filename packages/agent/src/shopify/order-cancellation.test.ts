import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import {
  graphqlRequest,
  graphqlResponse,
  shopifyOrderSettlementNode,
  shopifySuggestedRefundNode,
} from "../testing/shopify-graphql.js";
import { cancelOrder, quoteCancellationForApproval } from "./order-cancellation.js";
import type { ShopifyOrder, ShopifyTransaction } from "./types.js";

// The order as Shopify reports it before and after the cancellation.
function settlement(order: Record<string, unknown>) {
  return graphqlResponse({ order: shopifyOrderSettlementNode(order as unknown as ShopifyOrder) });
}

// Shopify's pricing of the whole refundable balance.
function calculationResponse({ refund }: { refund: { currency: string; transactions: unknown[] } }) {
  return graphqlResponse({
    order: {
      suggestedRefund: shopifySuggestedRefundNode({
        currency: refund.currency,
        transactions: refund.transactions as ShopifyTransaction[],
      }),
    },
  });
}

// Shopify accepted the cancellation and its job has already finished.
function accepted() {
  return graphqlResponse({
    orderCancel: { job: { id: "gid://shopify/Job/1", done: true }, orderCancelUserErrors: [] },
  });
}

function cancelVariables(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.find(([, init]) => graphqlRequest(init)?.operation === "ShopkeeperOrderCancel");
  return call ? graphqlRequest(call[1])!.variables : null;
}

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
  operationId: "execution-1:cancel-order",
  executionId: "execution-1",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cancelOrder", () => {
  it("uses safe cancellation defaults", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(settlement({ id: 123, name: "#1001", cancelled_at: null, financial_status: "pending" }))
      .mockResolvedValueOnce(accepted())
      .mockResolvedValueOnce(settlement({
        id: 123,
        name: "#1001",
        cancelled_at: "2026-07-12T12:00:00Z",
        cancel_reason: "other",
        financial_status: "pending",
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(cancelVariables(fetchMock)).toEqual({
      orderId: "gid://shopify/Order/123",
      reason: "OTHER",
      restock: true,
      refundMethod: { originalPaymentMethodsRefund: false },
    });
    expect(result.message).toContain("Reason: other. Restock requested: yes");
    expect(result.receipt).toMatchObject({
      tool: "cancel_order",
      outcome: "succeeded",
      providerReference: null,
      facts: {
        orderId: "123",
        cancelledAt: "2026-07-12T12:00:00Z",
        reason: "other",
        financialStatus: "pending",
        restockResult: null,
        refund: null,
      },
    });
  });

  it("honors restock=false and the requested reason", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(settlement({ id: 123, name: "#1001", cancelled_at: null }))
      .mockResolvedValueOnce(accepted())
      .mockResolvedValueOnce(settlement({
        id: 123,
        name: "#1001",
        cancelled_at: "2026-07-12T12:00:00Z",
        cancel_reason: "customer",
        financial_status: "voided",
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder({
      order_id: "123",
      reason: "customer",
      restock: false,
    }, ctx);

    expect(cancelVariables(fetchMock)).toMatchObject({ reason: "CUSTOMER", restock: false });
    expect(result.message).toContain("Restock requested: no");
  });

  it("rejects invalid ids without a provider call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder({ order_id: "gid://shopify/Order/nope" }, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("order_id must be a numeric Shopify ID");
    expect(result.receipt).toMatchObject({
      tool: "cancel_order",
      outcome: "failed",
      code: "definite_failure",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps an absent order distinct from provider failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(graphqlResponse({ order: null })));

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result).toMatchObject({
      status: "not_found",
      receipt: {
        tool: "cancel_order",
        outcome: "not_found",
        code: "order_not_found",
        target: { kind: "order", id: "123" },
      },
    });
  });

  it("is unknown when Shopify accepts the cancellation without a job", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(settlement({ id: 123, cancelled_at: null }))
      .mockResolvedValueOnce(graphqlResponse({ orderCancel: { job: null, orderCancelUserErrors: [] } })));

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result).toMatchObject({
      status: "unknown",
      message: "Unknown: Shopify accepted the cancellation request for order 123 but did not return its job. Do not retry or confirm it to the customer until it is reconciled.",
      receipt: { outcome: "unknown", code: "provider_job_missing" },
    });
  });

  // orderCancel runs in the background. A job that is still running is
  // Shopify's word that the cancellation is coming, so it is not a failure.
  it("is unknown while Shopify is still processing the cancellation", async () => {
    vi.useFakeTimers();
    const running = graphqlResponse({ job: { id: "gid://shopify/Job/1", done: false } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(settlement({ id: 123, cancelled_at: null }))
      .mockResolvedValueOnce(graphqlResponse({
        orderCancel: { job: { id: "gid://shopify/Job/1", done: false }, orderCancelUserErrors: [] },
      }))
      .mockImplementation(async () => running.clone());
    vi.stubGlobal("fetch", fetchMock);

    const pending = cancelOrder({ order_id: "123" }, ctx);
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();

    expect(result).toMatchObject({ status: "unknown", receipt: { outcome: "unknown", code: "provider_job_pending" } });
    expect(fetchMock.mock.calls.filter(([, init]) => graphqlRequest(init)?.operation === "ShopkeeperOrderSettlement"))
      .toHaveLength(1);
  });

  it("keeps an incomplete post-cancel response uncertain", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(settlement({ id: 123, cancelled_at: null }))
      .mockResolvedValueOnce(accepted())
      .mockResolvedValueOnce(settlement({ id: 123, cancelled_at: "2026-07-12T12:00:00Z" })));

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result).toMatchObject({
      status: "unknown",
      receipt: { outcome: "unknown", code: "confirmed_state_incomplete" },
    });
  });

  it("surfaces Shopify provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(settlement({ id: 123, cancelled_at: null }))
      .mockResolvedValueOnce(graphqlResponse({
        orderCancel: {
          job: null,
          orderCancelUserErrors: [{ code: "INVALID", field: ["orderId"], message: "Cannot cancel fulfilled order" }],
        },
      })));

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result).toMatchObject({
      status: "error",
      message: "Error: failed to cancel order - Cannot cancel fulfilled order",
      receipt: {
        version: 1,
        tool: "cancel_order",
        target: { kind: "order", id: "123" },
        outcome: "failed",
        code: "provider_rejected",
      },
    });
  });

  it("confirms an ambiguous cancellation with a follow-up order read", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(settlement({ id: 123, name: "#1001", cancelled_at: null }))
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(settlement({
        id: 123,
        name: "#1001",
        cancelled_at: "2026-07-12T12:00:00Z",
        cancel_reason: "customer",
        financial_status: "voided",
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder({ order_id: "123", reason: "customer" }, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("confirmed after an interrupted provider response");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns unknown when an ambiguous cancellation cannot be confirmed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(settlement({ id: 123, name: "#1001", cancelled_at: null }))
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(settlement({ id: 123, name: "#1001", cancelled_at: null }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("may still have committed at Shopify");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not call the cancellation endpoint for an already-cancelled order", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(settlement({
      id: 123,
      name: "#1001",
      cancelled_at: "2026-07-12T12:00:00Z",
      cancel_reason: "customer",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result).toMatchObject({
      status: "policy_block",
      message: "Error: failed to cancel order - order #1001 is already cancelled.",
      receipt: {
        version: 1,
        tool: "cancel_order",
        target: { kind: "order", id: "123" },
        outcome: "rejected",
        code: "already_cancelled",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["fulfilled", "partial"])('rechecks %s fulfillment before a delayed approval can cancel', async (fulfillmentStatus) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(settlement({
      id: 123,
      name: "#1001",
      cancelled_at: null,
      fulfillment_status: fulfillmentStatus,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result).toMatchObject({
      status: "policy_block",
      receipt: {
        version: 1,
        tool: "cancel_order",
        outcome: "rejected",
        code: "order_already_fulfilled",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe("refunding a paid order (decision H)", () => {
    // Shape of a paid, unfulfilled manual-gateway order as the real store
    // returned it in Gate C run 1: cancelling it without an amount left it paid.
    const paidOrder = (overrides: Record<string, unknown> = {}) => ({
      id: 123,
      name: "#1032",
      cancelled_at: null,
      financial_status: "paid",
      currency: "USD",
      refunds: [],
      ...overrides,
    });
    const calculation = (amount = "49.95", currency = "USD") => ({
      refund: {
        currency,
        transactions: [{ kind: "suggested_refund", gateway: "manual", amount, currency, parent_id: 77 }],
      },
    });
    const cancelled = (refunds: unknown[], financialStatus = "refunded") => ({
      id: 123,
      name: "#1032",
      cancelled_at: "2026-09-28T06:20:40Z",
      cancel_reason: "customer",
      financial_status: financialStatus,
      currency: "USD",
      refunds,
    });
    const refundRecord = (id: number, amount: string, status = "success") => ({
      id,
      transactions: [{ kind: "refund", status, gateway: "manual", amount, currency: "USD" }],
    });

    it("refunds Shopify's refundable balance with the cancellation and records what it refunded", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(settlement(paidOrder()))
        .mockResolvedValueOnce(calculationResponse(calculation()))
        .mockResolvedValueOnce(accepted())
        .mockResolvedValueOnce(settlement(cancelled([refundRecord(501, "49.95")])));
      vi.stubGlobal("fetch", fetchMock);

      const result = await cancelOrder({ order_id: "123", reason: "customer" }, ctx);

      expect(graphqlRequest(fetchMock.mock.calls[1][1])).toMatchObject({
        operation: "ShopkeeperRefundCalculation",
        variables: { id: "gid://shopify/Order/123", refundShipping: true, suggestFullRefund: true },
      });
      expect(cancelVariables(fetchMock)).toEqual({
        orderId: "gid://shopify/Order/123",
        reason: "CUSTOMER",
        restock: true,
        refundMethod: { originalPaymentMethodsRefund: true },
      });
      expect(result.status).toBe("ok");
      expect(result.message).toContain("Refunded 49.95 USD.");
      expect(result.receipt).toMatchObject({
        outcome: "succeeded",
        facts: { financialStatus: "refunded", refund: { amount: "49.95", currency: "USD" } },
      });
    });

    it("is unknown, not succeeded, when the requested refund is missing from Shopify's answer", async () => {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(settlement(paidOrder()))
        .mockResolvedValueOnce(calculationResponse(calculation()))
        .mockResolvedValueOnce(accepted())
        .mockResolvedValueOnce(settlement(cancelled([], "paid"))));

      const result = await cancelOrder({ order_id: "123", reason: "customer" }, ctx);

      expect(result.status).toBe("unknown");
      expect(result.message).toContain("shows no refund of the 49.95 USD that was requested");
      expect(result.receipt).toMatchObject({ outcome: "unknown", code: "confirmed_refund_missing" });
    });

    // Shopify refunds the balance it holds rather than an amount it is sent, so
    // a refund that differs from the approved one is checked, never assumed.
    it("is unknown when Shopify refunds a different amount than was approved", async () => {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(settlement(paidOrder()))
        .mockResolvedValueOnce(calculationResponse(calculation()))
        .mockResolvedValueOnce(accepted())
        .mockResolvedValueOnce(settlement(cancelled([refundRecord(501, "39.95")]))));

      const result = await cancelOrder({ order_id: "123", reason: "customer" }, ctx);

      expect(result.status).toBe("unknown");
      expect(result.message).toContain("refunded 39.95 USD, not the 49.95 USD that was approved");
      expect(result.receipt).toMatchObject({ outcome: "unknown", code: "confirmed_refund_mismatch" });
    });

    it("does not count a refund that is still pending", async () => {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(settlement(paidOrder()))
        .mockResolvedValueOnce(calculationResponse(calculation()))
        .mockResolvedValueOnce(accepted())
        .mockResolvedValueOnce(settlement(cancelled([refundRecord(501, "49.95", "pending")], "paid"))));

      const result = await cancelOrder({ order_id: "123", reason: "customer" }, ctx);

      expect(result.receipt).toMatchObject({ outcome: "unknown", code: "confirmed_refund_missing" });
    });

    it("records only the refund this cancellation made, not an earlier one", async () => {
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(settlement(paidOrder({
          financial_status: "partially_refunded",
          refunds: [{ id: 400 }],
        })))
        .mockResolvedValueOnce(calculationResponse(calculation("39.95")))
        .mockResolvedValueOnce(accepted())
        .mockResolvedValueOnce(settlement(cancelled([
          refundRecord(400, "10.00"),
          refundRecord(501, "39.95"),
        ]))));

      const result = await cancelOrder({ order_id: "123", reason: "customer" }, ctx);

      expect(result.receipt).toMatchObject({
        outcome: "succeeded",
        facts: { refund: { amount: "39.95", currency: "USD" } },
      });
    });

    it("asks for no refund on an order with nothing captured", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(settlement(paidOrder({ financial_status: "authorized" })))
        .mockResolvedValueOnce(accepted())
        .mockResolvedValueOnce(settlement(cancelled([], "voided")));
      vi.stubGlobal("fetch", fetchMock);

      const result = await cancelOrder({ order_id: "123", reason: "customer" }, ctx);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(cancelVariables(fetchMock)).toMatchObject({ refundMethod: { originalPaymentMethodsRefund: false } });
      expect(result.message).toContain("No payment was refunded.");
      expect(result.receipt).toMatchObject({ outcome: "succeeded", facts: { refund: null } });
    });

    it("refuses before cancelling when Shopify prices the refund in two currencies", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(settlement(paidOrder()))
        .mockResolvedValueOnce(calculationResponse({
          refund: {
            currency: "CAD",
            transactions: [{ kind: "suggested_refund", gateway: "manual", amount: "59.90", currency: "USD" }],
          },
        }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await cancelOrder({ order_id: "123", reason: "customer" }, ctx);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({
        status: "policy_block",
        receipt: { outcome: "rejected", code: "currency_mismatch" },
      });
    });

    it("refuses before cancelling when Shopify's quote changed after approval", async () => {
      // Approved at $49.95; a $10.00 refund was issued in Shopify admin before execution.
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(settlement(paidOrder({
          financial_status: "partially_refunded",
          refunds: [{ id: 400 }],
        })))
        .mockResolvedValueOnce(calculationResponse(calculation("39.95")));
      vi.stubGlobal("fetch", fetchMock);

      const result = await cancelOrder({
        order_id: "123",
        reason: "customer",
        approval_amount: "49.95",
        approval_currency: "USD",
      }, ctx);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(cancelVariables(fetchMock)).toBeNull();
      expect(result).toMatchObject({
        status: "policy_block",
        receipt: { outcome: "rejected", code: "amount_mismatch" },
      });
      expect(result.message).toContain("now calculates a refund of 39.95 USD for order #1032, but a refund of 49.95 USD was approved");
    });

    it("confirms the refund when an interrupted cancellation is reconciled", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(settlement(paidOrder()))
        .mockResolvedValueOnce(calculationResponse(calculation()))
        .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
        .mockResolvedValueOnce(settlement(cancelled([refundRecord(501, "49.95")])));
      vi.stubGlobal("fetch", fetchMock);

      const result = await cancelOrder({ order_id: "123", reason: "customer" }, ctx);

      expect(graphqlRequest(fetchMock.mock.calls[3][1])?.operation).toBe("ShopkeeperOrderSettlement");
      expect(result.status).toBe("ok");
      expect(result.receipt).toMatchObject({ facts: { refund: { amount: "49.95", currency: "USD" } } });
    });
  });
});

describe("quoteCancellationForApproval", () => {
  const order = (overrides: Record<string, unknown> = {}) => ({
    id: 123,
    name: "#1036",
    cancelled_at: null,
    fulfillment_status: null,
    financial_status: "paid",
    currency: "USD",
    refunds: [],
    ...overrides,
  });
  const calculation = (transactions: unknown[], currency = "USD") => ({ refund: { currency, transactions } });
  const suggested = (amount: string, currency = "USD") => ({ kind: "suggested_refund", gateway: "manual", amount, currency, parent_id: 77 });

  it("binds Shopify's quote and drops an amount the model wrote", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(settlement(order()))
      .mockResolvedValueOnce(calculationResponse(calculation([suggested("49.95")]))));

    const bound = await quoteCancellationForApproval(
      { order_id: "123", reason: "customer", approval_amount: "1.00", approval_currency: "EUR" },
      ctx,
    );

    expect(bound).toEqual({ order_id: "123", reason: "customer", approval_amount: "49.95", approval_currency: "USD" });
  });
});
