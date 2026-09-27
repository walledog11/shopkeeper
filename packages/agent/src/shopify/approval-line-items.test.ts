import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import {
  exchangeApprovalLineItems,
  orderEditApprovalLineItems,
  returnApprovalLineItems,
} from "./approval-line-items.js";

const ctx = { shop: "test-store.myshopify.com", accessToken: "shpat_test" };

function returnable(lines: { name: string; variant: string; quantity: number }[]) {
  return jsonResponse({
    data: {
      order: { id: "gid://shopify/Order/2001" },
      returnableFulfillments: {
        edges: [{
          node: {
            returnableFulfillmentLineItems: {
              edges: lines.map((line, index) => ({
                node: {
                  quantity: line.quantity,
                  fulfillmentLineItem: {
                    id: `gid://shopify/FulfillmentLineItem/${index + 1}`,
                    lineItem: { name: line.name, variant: { id: `gid://shopify/ProductVariant/${line.variant}` } },
                  },
                },
              })),
            },
          },
        }],
      },
    },
  });
}

function variants(nodes: { id: string; title: string; product: string }[]) {
  return jsonResponse({
    data: {
      nodes: nodes.map((node) => ({
        id: `gid://shopify/ProductVariant/${node.id}`,
        title: node.title,
        price: "10.00",
        product: { title: node.product },
      })),
    },
  });
}

const TWO_NAPKINS = [
  { name: "Napkin - Special", variant: "501", quantity: 1 },
  { name: "Napkin - Sample", variant: "502", quantity: 2 },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("returnApprovalLineItems", () => {
  it("names the one variant's returnable lines", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(returnable(TWO_NAPKINS)));

    await expect(returnApprovalLineItems({ order_id: "2001", variant_id: "502" }, ctx))
      .resolves.toEqual([{ name: "Napkin - Sample", quantity: 2, change: "return" }]);
  });

  it("names every returnable line when the return covers the whole order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(returnable(TWO_NAPKINS)));

    await expect(returnApprovalLineItems({ order_id: "2001" }, ctx)).resolves.toEqual([
      { name: "Napkin - Special", quantity: 1, change: "return" },
      { name: "Napkin - Sample", quantity: 2, change: "return" },
    ]);
  });

  it("names nothing for a variant Shopify does not show as returnable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(returnable(TWO_NAPKINS)));

    await expect(returnApprovalLineItems({ order_id: "2001", variant_id: "999" }, ctx)).resolves.toBeNull();
  });

  it("lets a provider failure propagate rather than calling it an unnamed target", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("down", { status: 503 })));

    await expect(returnApprovalLineItems({ order_id: "2001" }, ctx)).rejects.toThrow();
  });
});

describe("exchangeApprovalLineItems", () => {
  it("names the returned line and the replacement variant", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(returnable(TWO_NAPKINS))
      .mockResolvedValueOnce(variants([{ id: "503", title: "Blue", product: "Napkin" }])));

    await expect(exchangeApprovalLineItems(
      { order_id: "2001", variant_id: "501", exchange_variant_id: "503" },
      ctx,
    )).resolves.toEqual([
      { name: "Napkin - Special", quantity: 1, change: "return" },
      { name: "Napkin - Blue", quantity: 1, change: "replacement" },
    ]);
  });

  it("names nothing when fewer units can come back than the exchange needs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(returnable(TWO_NAPKINS)));

    await expect(exchangeApprovalLineItems(
      { order_id: "2001", variant_id: "501", exchange_variant_id: "503", quantity: 2 },
      ctx,
    )).resolves.toBeNull();
  });

  it("names nothing when Shopify does not return the replacement", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(returnable(TWO_NAPKINS))
      .mockResolvedValueOnce(variants([])));

    await expect(exchangeApprovalLineItems(
      { order_id: "2001", variant_id: "501", exchange_variant_id: "503" },
      ctx,
    )).resolves.toBeNull();
  });
});

describe("orderEditApprovalLineItems", () => {
  const order = (lineItems: Record<string, unknown>[]) => jsonResponse({ order: { id: 2001, line_items: lineItems } });

  it("names the whole line a swap removes and the variant it adds", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(order([
        { id: 1, variant_id: 501, title: "Napkin", variant_title: "Special", quantity: 2, current_quantity: 2 },
        { id: 2, variant_id: 502, title: "Napkin", variant_title: "Sample", quantity: 1, current_quantity: 1 },
      ]))
      .mockResolvedValueOnce(variants([{ id: "503", title: "Default Title", product: "Table Runner" }])));

    await expect(orderEditApprovalLineItems(
      { order_id: "2001", remove_variant_id: "501", variant_id: "503", quantity: 1 },
      ctx,
    )).resolves.toEqual([
      { name: "Napkin - Special", quantity: 2, change: "remove" },
      { name: "Table Runner", quantity: 1, change: "add" },
    ]);
  });

  it("names nothing for a variant on two lines, which the edit refuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(order([
      { id: 1, variant_id: 501, title: "Napkin", quantity: 1, current_quantity: 1 },
      { id: 2, variant_id: 501, title: "Napkin", quantity: 1, current_quantity: 1 },
    ])));

    await expect(orderEditApprovalLineItems({ order_id: "2001", remove_variant_id: "501" }, ctx))
      .resolves.toBeNull();
  });

  it("names nothing for a malformed ID instead of throwing", async () => {
    await expect(orderEditApprovalLineItems({ order_id: "2001", remove_variant_id: "gid://501" }, ctx))
      .resolves.toBeNull();
  });
});
