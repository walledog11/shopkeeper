import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addShopifyCustomerNote,
  createRefund,
  createReturn,
  createShopifyOrder,
  editShopifyOrder,
  issueDiscount,
  updateShopifyOrderAddress,
} from "./shopify.js";

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

describe("shopify tools", () => {
  it("does not overwrite a customer note when fetching the existing note fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ errors: "Not found" }, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await addShopifyCustomerNote({ customer_id: "123", note: "New note" }, ctx);

    expect(result.message).toContain("Error: failed to add note");
    expect(result.status).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports partial success when an order address update succeeds but customer sync fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        order: {
          id: 456,
          order_number: 1001,
          shipping_address: {
            address1: "123 Main St",
            city: "Los Angeles",
            province: "CA",
            zip: "90001",
            country: "United States",
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ errors: "Customer not found" }, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress({
      order_id: "456",
      customer_id: "123",
      address1: "123 Main St",
      city: "Los Angeles",
      province: "CA",
      zip: "90001",
      country: "United States",
    }, ctx);

    expect(result.message).toContain("shipping address updated");
    expect(result.message).toContain("customer profile sync failed");
    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("creates a full refund using calculated line items and parent transactions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        order: {
          id: 456,
          currency: "USD",
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
        refund: { transactions: [{ amount: "25.00" }] },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", reason: "Customer request" }, ctx);

    const calculateBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    const createBody = JSON.parse(fetchMock.mock.calls[2][1].body as string);

    expect(calculateBody.refund.refund_line_items).toEqual([
      { line_item_id: 11, quantity: 2, restock_type: "no_restock" },
    ]);
    expect(createBody.refund.refund_line_items).toEqual([
      { line_item_id: 11, quantity: 2, restock_type: "no_restock", location_id: 1 },
    ]);
    expect(createBody.refund.transactions[0]).toMatchObject({
      kind: "refund",
      gateway: "shopify_payments",
      parent_id: 222,
      amount: "25.00",
      currency: "USD",
    });
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
    expect(result.status).toBe("error");
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
                  { node: { title: "Old shirt", quantity: 0, variant: { title: "Red" } } },
                  { node: { title: "New shirt", quantity: 2, variant: { title: "Blue" } } },
                  { node: { title: "Sticker", quantity: 1, variant: { title: "Default Title" } } },
                ],
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
      status: "error",
      message: "Error: edit_shopify_order requires at least variant_id (to add) or remove_variant_id (to remove).",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("issues a single-use percentage discount and converts the percentage to a fraction", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      data: {
        discountCodeBasicCreate: {
          codeDiscountNode: {
            codeDiscount: { codes: { nodes: [{ code: "THANKS10-ABCDEF" }] }, endsAt: null },
          },
          userErrors: [],
        },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await issueDiscount({ percentage: 10, reason: "Shipping delay" }, ctx);

    const { query, variables } = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(query).toContain("mutation discountCodeBasicCreate");
    expect(variables.basicCodeDiscount).toMatchObject({
      customerGets: { items: { all: true }, value: { percentage: 0.1 } },
      appliesOncePerCustomer: true,
      usageLimit: 1,
    });
    expect(result.status).toBe("ok");
    expect(result.message).toContain("THANKS10-ABCDEF");
  });

  it("rejects a discount percentage outside 0–100 without calling Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await issueDiscount({ percentage: 150 }, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("percentage must be a number greater than 0 and at most 100");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces Shopify userErrors when the discount cannot be created", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      data: {
        discountCodeBasicCreate: {
          codeDiscountNode: null,
          userErrors: [{ field: ["code"], message: "Code already exists." }],
        },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await issueDiscount({ percentage: 10 }, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("Code already exists.");
  });

  it("opens a return for a single requested item and maps the reason to the Shopify enum", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          order: {
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
    expect(queryBody.query).toContain("returnableFulfillments");
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

  it("returns an error when the order has no returnable items", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      data: { order: { returnableFulfillments: { edges: [] } } },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createReturn({ order_id: "456" }, ctx);

    expect(result.status).toBe("error");
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
    expect(result.status).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
