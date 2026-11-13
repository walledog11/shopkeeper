import { afterEach, describe, expect, it, vi } from "vitest";
import { graphqlRequest, graphqlResponse, shopifyOrderNode } from "../testing/shopify-graphql.js";
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
    const fetchMock = vi.fn().mockResolvedValueOnce(graphqlResponse({
      orders: {
        nodes: [shopifyOrderNode({ id: 1, current_total_price: "10.00", currency: "USD" })],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const start = new Date("2026-04-28T08:00:00Z");
    const end = new Date("2026-04-29T08:00:00Z");
    const summary = await summarizeOrdersInWindow(ctx, { start, end });

    expect(summary.orderCount).toBe(1);
    expect(summary.revenueTotal).toBe(10);

    expect(graphqlRequest(fetchMock.mock.calls[0]?.[1])?.variables.query).toBe(
      `created_at:>="${start.toISOString()}" created_at:<="${end.toISOString()}"`,
    );
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
