import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addShopifyCustomerNote,
  createRefund,
  createShopifyOrder,
  editShopifyOrder,
  updateShopifyOrderAddress,
} from "./shopify";

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

    expect(result).toContain("Error: failed to add note");
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

    expect(result).toContain("shipping address updated");
    expect(result).toContain("customer profile sync failed");
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

    expect(result).toContain("variant 123 was not found");
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

    expect(result).toContain("Custom line items are disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
