import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatSalesPulseLine,
  shiftWindowByDays,
  summarizeOrders,
  summarizeOrdersInWindow,
} from "./sales-pulse.js";

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

describe("formatSalesPulseLine", () => {
  it("formats the current window and optional prior-week comparison", () => {
    const current = { orderCount: 12, revenueTotal: 1847, currency: "USD" };
    const prior = { orderCount: 9, revenueTotal: 1420, currency: "USD" };

    expect(formatSalesPulseLine(current, prior)).toBe(
      "Sales since your last briefing: 12 orders · $1847 (vs 9 orders · $1420 last week)",
    );
  });

  it("omits the comparison when prior data is unavailable", () => {
    const current = { orderCount: 1, revenueTotal: 25.5, currency: "USD" };

    expect(formatSalesPulseLine(current)).toBe(
      "Sales since your last briefing: 1 order · $25.50",
    );
  });
});
