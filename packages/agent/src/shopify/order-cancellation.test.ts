import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelOrder } from "./order-cancellation.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
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

describe("cancelOrder", () => {
  it("uses safe cancellation defaults", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        order: { id: 123, name: "#1001", cancelled_at: null },
      }))
      .mockResolvedValueOnce(jsonResponse({
        order: { id: 123, name: "#1001", financial_status: "refunded" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder({ order_id: "123" }, ctx);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);

    expect(body).toEqual({ reason: "other", restock: true, email: false });
    expect(result.message).toContain("Reason: other. Restock requested: yes");
  });

  it("honors restock=false and the requested reason", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        order: { id: 123, name: "#1001", cancelled_at: null },
      }))
      .mockResolvedValueOnce(jsonResponse({
        order: { id: 123, name: "#1001", financial_status: "voided" },
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails when Shopify omits the cancelled order", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: { id: 123, cancelled_at: null } }))
      .mockResolvedValueOnce(jsonResponse({})));

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result).toEqual({
      status: "unknown",
      message: "Unknown: Shopify accepted the cancellation request for order 123 but did not return the cancelled order. Do not retry or confirm it to the customer until it is reconciled.",
    });
  });

  it("surfaces Shopify provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: { id: 123, cancelled_at: null } }))
      .mockResolvedValueOnce(jsonResponse({ errors: "Cannot cancel fulfilled order" }, 422)));

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result).toEqual({
      status: "error",
      message: "Error: failed to cancel order (422) - Cannot cancel fulfilled order",
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

    expect(result).toEqual({
      status: "error",
      message: "Error: failed to cancel order - order #1001 is already cancelled.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
