import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import {
  createRefund,
  createReturn,
  createShopifyOrder,
  editShopifyOrder,
} from "./shopify.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shopify tools", () => {
  it("creates a full refund using calculated line items and parent transactions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        order: {
          id: 456,
          currency: "USD",
          financial_status: "paid",
          refunds: [],
          line_items: [{ id: 11, title: "Hat", quantity: 2, current_quantity: 2 }],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        refund: {
          currency: "USD",
          shipping: { amount: "5.00" },
          refund_line_items: [{ line_item_id: 11, quantity: 2, restock_type: "no_restock", location_id: 1 }],
          transactions: [{
            kind: "suggested_refund",
            gateway: "shopify_payments",
            parent_id: 222,
            amount: "25.00",
            currency: "USD",
          }],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          refundCreate: {
            refund: {
              id: "gid://shopify/Refund/9001",
              totalRefundedSet: { presentmentMoney: { amount: "25.00" } },
              transactions: { nodes: [{ id: "gid://shopify/OrderTransaction/7001", status: "SUCCESS" }] },
            },
            userErrors: [],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "25.00", currency: "USD", reason: "Customer request" }, ctx);

    const calculateBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    const createBody = JSON.parse(fetchMock.mock.calls[2][1].body as string);

    expect(calculateBody.refund.refund_line_items).toEqual([
      { line_item_id: 11, quantity: 2, restock_type: "no_restock" },
    ]);
    expect(createBody.variables.input.refundLineItems).toEqual([
      {
        lineItemId: "gid://shopify/LineItem/11",
        quantity: 2,
        restockType: "NO_RESTOCK",
      },
    ]);
    expect(createBody.variables.input.transactions[0]).toMatchObject({
      kind: "REFUND",
      gateway: "shopify_payments",
      orderId: "gid://shopify/Order/456",
      parentId: "gid://shopify/OrderTransaction/222",
      amount: "25.00",
    });
    expect(createBody.variables.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.message).toContain("Refund of $25.00 issued successfully");
    expect(result.refundedCents).toBe(2500);
  });

  it("fails order removal when the requested variant is not on the order", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      data: {
        orderEditBegin: {
          calculatedOrder: {
            id: "gid://shopify/CalculatedOrder/1",
            lineItems: {
              edges: [{
                node: {
                  id: "gid://shopify/CalculatedLineItem/1",
                  quantity: 1,
                  title: "Hat",
                  variant: { id: "gid://shopify/ProductVariant/999" },
                },
              }],
              pageInfo: { hasNextPage: false },
            },
          },
          userErrors: [],
        },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await editShopifyOrder({ order_id: "456", remove_variant_id: "123" }, ctx);

    expect(result.message).toContain("variant 123 was not found");
    expect(result.status).toBe("policy_block");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("edits an order by adding a variant, removing the old item, and committing the result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          orderEditBegin: {
            calculatedOrder: {
              id: "gid://shopify/CalculatedOrder/1",
              lineItems: {
                edges: [{
                  node: {
                    id: "gid://shopify/CalculatedLineItem/1",
                    quantity: 1,
                    title: "Old shirt",
                    variant: { id: "gid://shopify/ProductVariant/123" },
                  },
                }],
                pageInfo: { hasNextPage: false },
              },
            },
            userErrors: [],
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          orderEditAddVariant: {
            calculatedOrder: { id: "gid://shopify/CalculatedOrder/1" },
            userErrors: [],
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          orderEditSetQuantity: {
            calculatedOrder: { id: "gid://shopify/CalculatedOrder/1" },
            userErrors: [],
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          orderEditCommit: {
            order: {
              name: "#1001",
              lineItems: {
                edges: [
                  { node: { title: "Old shirt", currentQuantity: 0, variant: { id: "gid://shopify/ProductVariant/123", title: "Red" } } },
                  { node: { title: "New shirt", currentQuantity: 2, variant: { id: "gid://shopify/ProductVariant/789", title: "Blue" } } },
                  { node: { title: "Sticker", currentQuantity: 1, variant: { id: "gid://shopify/ProductVariant/999", title: "Default Title" } } },
                ],
                pageInfo: { hasNextPage: false },
              },
            },
            userErrors: [],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await editShopifyOrder({
      order_id: "456",
      variant_id: "789",
      remove_variant_id: "123",
      quantity: 2,
    }, ctx);

    const requestBodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string));
    expect(requestBodies.map(({ query }) => query)).toEqual([
      expect.stringContaining("mutation orderEditBegin"),
      expect.stringContaining("mutation orderEditAddVariant"),
      expect.stringContaining("mutation orderEditSetQuantity"),
      expect.stringContaining("mutation orderEditCommit"),
    ]);
    expect(requestBodies.map(({ variables }) => variables)).toEqual([
      { id: "gid://shopify/Order/456" },
      {
        id: "gid://shopify/CalculatedOrder/1",
        variantId: "gid://shopify/ProductVariant/789",
        quantity: 2,
      },
      {
        id: "gid://shopify/CalculatedOrder/1",
        lineItemId: "gid://shopify/CalculatedLineItem/1",
        quantity: 0,
      },
      { id: "gid://shopify/CalculatedOrder/1" },
    ]);
    expect(result).toEqual({
      status: "ok",
      message: "Successfully swapped item on order #1001. Current order items: 2x New shirt (Blue), 1x Sticker.",
    });
  });

  it("does not begin an order edit without an item to add or remove", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await editShopifyOrder({ order_id: "456" }, ctx);

    expect(result).toEqual({
      status: "policy_block",
      message: "Error: edit_shopify_order requires at least variant_id (to add) or remove_variant_id (to remove).",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens a return for a single requested item and maps the reason to the Shopify enum", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          order: { id: "gid://shopify/Order/456" },
          returnableFulfillments: {
            edges: [{
              node: {
                returnableFulfillmentLineItems: {
                  edges: [
                    {
                      node: {
                        quantity: 1,
                        fulfillmentLineItem: {
                          id: "gid://shopify/FulfillmentLineItem/11",
                          lineItem: { name: "Blue shirt", variant: { id: "gid://shopify/ProductVariant/789" } },
                        },
                      },
                    },
                    {
                      node: {
                        quantity: 2,
                        fulfillmentLineItem: {
                          id: "gid://shopify/FulfillmentLineItem/22",
                          lineItem: { name: "Red hat", variant: { id: "gid://shopify/ProductVariant/123" } },
                        },
                      },
                    },
                  ],
                },
              },
            }],
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          returnCreate: {
            return: { id: "gid://shopify/Return/1", name: "#1001-R1", status: "OPEN" },
            userErrors: [],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createReturn({ order_id: "456", variant_id: "789", reason: "defective" }, ctx);

    const queryBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const createBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    // Pin the root-query form, not just the word: `returnableFulfillments` was
    // nested under `order` for the whole life of this capability, which Shopify
    // rejects as an undefined field, and a substring check passed either way.
    expect(queryBody.query).toContain("returnableFulfillments(orderId: $orderId");
    expect(queryBody.variables).toEqual({ orderId: "gid://shopify/Order/456" });
    expect(createBody.query).toContain("mutation returnCreate");
    expect(createBody.variables.returnInput).toEqual({
      orderId: "gid://shopify/Order/456",
      notifyCustomer: false,
      returnLineItems: [
        { fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/11", quantity: 1, returnReason: "DEFECTIVE" },
      ],
    });
    expect(result.status).toBe("ok");
    expect(result.message).toContain("#1001-R1");
    expect(result.message).toContain("No refund was issued");
  });

  it("policy-blocks when the order has no returnable items", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      data: { order: { id: "gid://shopify/Order/456" }, returnableFulfillments: { edges: [] } },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createReturn({ order_id: "456" }, ctx);

    expect(result.status).toBe("policy_block");
    expect(result.message).toContain("no returnable items");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks custom line items unless explicitly allowed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await createShopifyOrder({
      email: "jane@example.com",
      first_name: "Jane",
      last_name: "Test",
      address1: "123 Main St",
      city: "Los Angeles",
      province: "CA",
      zip: "90001",
      country: "United States",
      line_items: [{ title: "Custom item", price: "10.00", quantity: 1 }],
    }, ctx);

    expect(result.message).toContain("Custom line items are disabled");
    expect(result.status).toBe("policy_block");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
