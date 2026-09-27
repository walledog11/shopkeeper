import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { listRecentUnfulfilledOrderIds } from "./orders.js";
import { serializeOrder } from "./serializers.js";

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

describe("serializeOrder currency", () => {
  const baseOrder = {
    id: 456,
    name: "#1031",
    currency: "USD",
    current_total_price: "43.48",
    financial_status: "paid",
    line_items: [{ id: 11, title: "Hat", quantity: 1 }],
  };

  // The presentment fields must be invisible on a single-currency store: every
  // existing planner fixture is one, and their serialized orders have to stay
  // byte-identical for this change to owe no model evaluation.
  it("omits presentment fields when the store charges in its own currency", () => {
    expect(serializeOrder(baseOrder)).toEqual(serializeOrder({
      ...baseOrder,
      presentment_currency: "USD",
      current_total_price_set: {
        shop_money: { amount: "43.48", currency_code: "USD" },
        presentment_money: { amount: "43.48", currency_code: "USD" },
      },
    }));
    expect(serializeOrder(baseOrder)).not.toHaveProperty("presentment_currency");
  });

  // Order #1031: the merchant's books say $43.48 USD, the customer paid 59.90 CAD.
  // Without this the agent quotes and refunds the wrong number.
  it("exposes what the customer was actually charged when the currencies differ", () => {
    expect(serializeOrder({
      ...baseOrder,
      presentment_currency: "CAD",
      current_total_price_set: {
        shop_money: { amount: "43.48", currency_code: "USD" },
        presentment_money: { amount: "59.90", currency_code: "CAD" },
      },
    })).toMatchObject({
      total_price: "43.48",
      currency: "USD",
      presentment_total_price: "59.90",
      presentment_currency: "CAD",
    });
  });
});

describe("serializeOrder line items", () => {
  // Order #1033 on the dev store: two variants of one product. Shopify's `title`
  // is the product's, so without `variant_title` both lines read "Selling Plans
  // Ski Wax" and "refund just the sample" names neither.
  it("tells two variants of one product apart", () => {
    const { items } = serializeOrder({
      id: 1033,
      name: "#1033",
      line_items: [
        { id: 21, variant_id: 31, title: "Selling Plans Ski Wax", variant_title: "Selling Plans Ski Wax", quantity: 1 },
        { id: 22, variant_id: 32, title: "Selling Plans Ski Wax", variant_title: "Sample Selling Plans Ski Wax", quantity: 1 },
      ],
    });
    expect(items.map((item) => [item.line_item_id, item.variant_title])).toEqual([
      ["21", "Selling Plans Ski Wax"],
      ["22", "Sample Selling Plans Ski Wax"],
    ]);
  });

  // A default variant has no variant title. Its line must serialize exactly as
  // before, so no planner fixture's input changes.
  it("leaves a default-variant line unchanged", () => {
    const [item] = serializeOrder({
      id: 1,
      line_items: [{ id: 11, title: "Hat", variant_title: null, quantity: 1 }],
    }).items;
    expect(item).not.toHaveProperty("variant_title");
    expect(Object.keys(item!)).toEqual([
      "line_item_id", "variant_id", "title", "quantity",
      "fulfillable_quantity", "current_quantity", "fulfillment_status",
    ]);
  });
});
