import { afterEach, describe, expect, it, vi } from "vitest";
import { graphqlRequest, graphqlResponse, shopifyOrderNode } from "../testing/shopify-graphql.js";
import { getOrderByName, listRecentUnfulfilledOrderIds } from "./orders.js";
import { serializeOrder } from "./serializers.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function ordersPage(orders: Parameters<typeof shopifyOrderNode>[0][]) {
  return graphqlResponse({
    orders: { nodes: orders.map(shopifyOrderNode), pageInfo: { hasNextPage: false, endCursor: null } },
  });
}

describe("listRecentUnfulfilledOrderIds", () => {
  it("returns string order ids for paid unfulfilled open orders", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ordersPage([{ id: 1001 }, { id: 1002 }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listRecentUnfulfilledOrderIds(ctx, 10)).resolves.toEqual(["1001", "1002"]);

    const request = graphqlRequest(fetchMock.mock.calls[0]?.[1]);
    expect(request?.operation).toBe("ShopkeeperOrders");
    expect(request?.variables).toMatchObject({
      query: "status:open fulfillment_status:unfulfilled financial_status:paid",
      first: 10,
    });
  });

  it("bounds discovery to the given window when one is supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ordersPage([{ id: 1001 }]));
    vi.stubGlobal("fetch", fetchMock);
    const since = new Date("2026-08-03T00:00:00.000Z");

    await listRecentUnfulfilledOrderIds(ctx, 10, since);

    expect(graphqlRequest(fetchMock.mock.calls[0]?.[1])?.variables.query)
      .toContain('created_at:>="2026-08-03T00:00:00.000Z"');
  });

  it("returns an empty list when Shopify responds with no orders", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ordersPage([])));

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

describe("order status evidence", () => {
  it("reads cancellation and shipment evidence independently for a refunded order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ordersPage([{
      id: 1035, name: "#1035", cancelled_at: "2026-09-30T07:20:09Z",
      financial_status: "refunded", fulfillment_status: null, fulfillments: [],
    }])));
    const result = await getOrderByName({ order_name: "1035" }, ctx);
    expect(result.status).toBe("ok");
    expect(JSON.parse(result.message)).toMatchObject({
      cancelled_at: "2026-09-30T07:20:09Z",
      financial_status: "refunded", shipping_status: "not_shipped_yet",
    });
  });

  it("does not infer shipment or return history from restocking", () => {
    expect(serializeOrder({ id: 1032, fulfillment_status: "restocked", fulfillments: [] }))
      .toMatchObject({ shipping_status: "unknown" });
    expect(serializeOrder({
      id: 1032, fulfillment_status: "restocked",
      fulfillments: [{ status: "cancelled", shipment_status: "delivered" }],
    })).toMatchObject({ shipping_status: "unknown" });
    expect(serializeOrder({
      id: 1032, fulfillment_status: "restocked",
      fulfillments: [{ status: "success", shipment_status: "delivered" }],
    })).toMatchObject({ shipping_status: "delivered" });
  });
});
