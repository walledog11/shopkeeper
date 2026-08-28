import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { listRecentUnfulfilledOrderIds } from "./orders.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

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
    expect(url.searchParams.get("created_at_min")).toBeNull();
  });

  it("bounds discovery to the given window when one is supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ orders: [{ id: 1001 }] }));
    vi.stubGlobal("fetch", fetchMock);
    const since = new Date("2026-08-03T00:00:00.000Z");

    await listRecentUnfulfilledOrderIds(ctx, 10, since);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("created_at_min")).toBe("2026-08-03T00:00:00.000Z");
  });

  it("returns an empty list when Shopify responds with no orders", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ orders: [] })));

    await expect(listRecentUnfulfilledOrderIds(ctx)).resolves.toEqual([]);
  });
});
