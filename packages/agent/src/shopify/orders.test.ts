import { afterEach, describe, expect, it, vi } from "vitest";
import { listRecentUnfulfilledOrderIds } from "./orders.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("listRecentUnfulfilledOrderIds", () => {
  it("returns string order ids for paid unfulfilled open orders", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      orders: [{ id: 1001 }, { id: 1002 }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listRecentUnfulfilledOrderIds(ctx, 10)).resolves.toEqual(["1001", "1002"]);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toContain("/orders.json");
    expect(url.searchParams.get("status")).toBe("open");
    expect(url.searchParams.get("fulfillment_status")).toBe("unfulfilled");
    expect(url.searchParams.get("financial_status")).toBe("paid");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("fields")).toBe("id");
  });

  it("returns an empty list when Shopify responds with no orders", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ orders: [] })));

    await expect(listRecentUnfulfilledOrderIds(ctx)).resolves.toEqual([]);
  });
});
