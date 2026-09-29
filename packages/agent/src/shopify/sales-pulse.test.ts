import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import {
  shiftWindowByDays,
  summarizeOrders,
  summarizeOrdersInWindow,
} from "./sales-pulse.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("summarizeOrders", () => {
  it("counts non-cancelled orders and sums revenue", () => {
    const summary = summarizeOrders([
      { id: 1, current_total_price: "42.00", currency: "USD" },
      { id: 2, cancelled_at: "2026-04-01T00:00:00Z", current_total_price: "99.00" },
      { id: 3, total_price: "8.50", currency: "USD", financial_status: "paid" },
    ]);

    expect(summary).toEqual({
      orderCount: 2,
      revenueTotal: 50.5,
      currency: "USD",
    });
  });
});

describe("summarizeOrdersInWindow", () => {
  it("requests orders in the created_at window", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      orders: [{ id: 1, current_total_price: "10.00", currency: "USD" }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const start = new Date("2026-04-28T08:00:00Z");
    const end = new Date("2026-04-29T08:00:00Z");
    const summary = await summarizeOrdersInWindow(ctx, { start, end });

    expect(summary.orderCount).toBe(1);
    expect(summary.revenueTotal).toBe(10);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("created_at_min")).toBe(start.toISOString());
    expect(url.searchParams.get("created_at_max")).toBe(end.toISOString());
  });
});

describe("shiftWindowByDays", () => {
  it("shifts both bounds by the requested number of days", () => {
    const window = {
      start: new Date("2026-04-28T08:00:00Z"),
      end: new Date("2026-04-29T08:00:00Z"),
    };

    expect(shiftWindowByDays(window, -7)).toEqual({
      start: new Date("2026-04-21T08:00:00Z"),
      end: new Date("2026-04-22T08:00:00Z"),
    });
  });
});
