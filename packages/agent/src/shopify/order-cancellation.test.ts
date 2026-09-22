import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { cancelOrder } from "./order-cancellation.js";

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
      .mockResolvedValueOnce(jsonResponse({
        order: { id: 123, name: "#1001", cancelled_at: null },
      }))
      .mockResolvedValueOnce(jsonResponse({
        order: {
          id: 123,
          name: "#1001",
          cancelled_at: "2026-07-12T12:00:00Z",
          cancel_reason: "other",
          financial_status: "refunded",
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder({ order_id: "123" }, ctx);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);

    expect(body).toEqual({ reason: "other", restock: true, email: false });
    expect(result.message).toContain("Reason: other. Restock requested: yes");
    expect(result.receipt).toMatchObject({
      tool: "cancel_order",
      outcome: "succeeded",
      providerReference: null,
      facts: {
        orderId: "123",
        cancelledAt: "2026-07-12T12:00:00Z",
        reason: "other",
        financialStatus: "refunded",
        restockResult: null,
      },
    });
  });

  it("honors restock=false and the requested reason", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        order: { id: 123, name: "#1001", cancelled_at: null },
      }))
      .mockResolvedValueOnce(jsonResponse({
        order: {
          id: 123,
          name: "#1001",
          cancelled_at: "2026-07-12T12:00:00Z",
          cancel_reason: "customer",
          financial_status: "voided",
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder({
      order_id: "123",
      reason: "customer",
      restock: false,
    }, ctx);

    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      reason: "customer",
      restock: false,
    });
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({})));

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

  it("fails when Shopify omits the cancelled order", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: { id: 123, cancelled_at: null } }))
      .mockResolvedValueOnce(jsonResponse({})));

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result).toMatchObject({
      status: "unknown",
      message: "Unknown: Shopify accepted the cancellation request for order 123 but did not return the cancelled order. Do not retry or confirm it to the customer until it is reconciled.",
      receipt: { outcome: "unknown", code: "provider_order_missing" },
    });
  });

  it("keeps an incomplete post-cancel response uncertain", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: { id: 123, cancelled_at: null } }))
      .mockResolvedValueOnce(jsonResponse({
        order: { id: 123, cancelled_at: "2026-07-12T12:00:00Z" },
      })));

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result).toMatchObject({
      status: "unknown",
      receipt: { outcome: "unknown", code: "confirmed_state_incomplete" },
    });
  });

  it("surfaces Shopify provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: { id: 123, cancelled_at: null } }))
      .mockResolvedValueOnce(jsonResponse({ errors: "Cannot cancel fulfilled order" }, 422)));

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result).toMatchObject({
      status: "error",
      message: "Error: failed to cancel order (422) - Cannot cancel fulfilled order",
      receipt: {
        version: 1,
        tool: "cancel_order",
        target: { kind: "order", id: "123" },
        outcome: "failed",
        code: "definite_failure",
      },
    });
  });

  it("confirms an ambiguous cancellation with a follow-up order read", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        order: { id: 123, name: "#1001", cancelled_at: null },
      }))
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(jsonResponse({
        order: {
          id: 123,
          name: "#1001",
          cancelled_at: "2026-07-12T12:00:00Z",
          cancel_reason: "customer",
          financial_status: "refunded",
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder({ order_id: "123", reason: "customer" }, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("confirmed after an interrupted provider response");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns unknown when an ambiguous cancellation cannot be confirmed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        order: { id: 123, name: "#1001", cancelled_at: null },
      }))
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(jsonResponse({
        order: { id: 123, name: "#1001", cancelled_at: null },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("may still have committed at Shopify");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not call the cancellation endpoint for an already-cancelled order", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      order: {
        id: 123,
        name: "#1001",
        cancelled_at: "2026-07-12T12:00:00Z",
        cancel_reason: "customer",
      },
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
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      order: {
        id: 123,
        name: "#1001",
        cancelled_at: null,
        fulfillment_status: fulfillmentStatus,
      },
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
});
