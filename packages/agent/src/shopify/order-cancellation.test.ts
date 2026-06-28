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
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      order: { id: 123, name: "#1001", financial_status: "refunded" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder({ order_id: "123" }, ctx);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    expect(body).toEqual({ reason: "other", restock: true, email: false });
    expect(result.message).toContain("Reason: other. Items restocked");
  });

  it("honors restock=false and the requested reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      order: { id: 123, name: "#1001", financial_status: "voided" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelOrder({
      order_id: "123",
      reason: "customer",
      restock: false,
    }, ctx);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      reason: "customer",
      restock: false,
    });
    expect(result.message).toContain("Items not restocked");
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result).toEqual({
      status: "error",
      message: "Error: failed to cancel order - order 123 was not returned by Shopify.",
    });
  });

  it("surfaces Shopify provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: "Cannot cancel fulfilled order" }, 422)));

    const result = await cancelOrder({ order_id: "123" }, ctx);

    expect(result).toEqual({
      status: "error",
      message: "Error: failed to cancel order (422) - Cannot cancel fulfilled order",
    });
  });
});
