import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { graphqlRequest, graphqlResponse } from "../testing/shopify-graphql.js";
import { createShopifyOrder } from "./shopify.js";
import { shopifyOperationTag } from "../shopify/client.js";

// Shopify's answer to an order lookup: the tag search or the newest orders.
function ordersFound(...nodes: unknown[]) {
  return graphqlResponse({ orders: { nodes } });
}

// The order Shopify holds for an operation, as the lookups and the create return it.
function createdOrder(operationTag: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "gid://shopify/Order/456",
    legacyResourceId: "456",
    name: "#1001",
    email: "jane@example.com",
    tags: [operationTag],
    displayFinancialStatus: "PENDING",
    totalPriceSet: { shopMoney: { amount: "25.0", currencyCode: "USD" } },
    ...overrides,
  };
}

// Shopify created the order and answered with it.
function orderCreated(order: unknown) {
  return graphqlResponse({ orderCreate: { order, userErrors: [] } });
}

function operations(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([, init]) => graphqlRequest(init as RequestInit)?.operation);
}

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shopify tools", () => {
  it("creates an order with a stable operation tag after confirming it does not already exist", async () => {
    const operationId = "0ecfcf1c-2a07-4caf-956f-77cbaa2fb83a:create_order";
    const operationTag = shopifyOperationTag(operationId);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ordersFound())
      .mockResolvedValueOnce(ordersFound())
      .mockResolvedValueOnce(orderCreated(createdOrder(operationTag)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createShopifyOrder({
      email: "jane@example.com",
      address1: "123 Main St",
      city: "Los Angeles",
      province: "CA",
      zip: "90001",
      country: "United States",
      line_items: [{ variant_id: "789", quantity: 1 }],
    }, { ...ctx, operationId });

    expect(operations(fetchMock)).toEqual(["FindShopkeeperCreatedOrder", "RecentShopkeeperOrders", "ShopkeeperOrderCreate"]);
    expect(graphqlRequest(fetchMock.mock.calls[0]![1])!.variables).toEqual({ query: `tag:${operationTag}` });
    const address = { address1: "123 Main St", city: "Los Angeles", province: "CA", zip: "90001", country: "United States" };
    expect(graphqlRequest(fetchMock.mock.calls[2]![1])!.variables).toEqual({
      order: {
        email: "jane@example.com",
        customer: { toUpsert: { email: "jane@example.com" } },
        financialStatus: "PENDING",
        lineItems: [{ variantId: "gid://shopify/ProductVariant/789", quantity: 1 }],
        shippingAddress: address,
        billingAddress: address,
        tags: [operationTag],
      },
      options: { sendReceipt: false, sendFulfillmentReceipt: false, inventoryBehaviour: "BYPASS" },
    });
    expect(result).toEqual({
      status: "ok",
      message: "Done — order #1001 is in for jane@example.com, total $25.00, payment pending.\n\n[View in Shopify](https://test-store.myshopify.com/admin/orders/456)",
    });
  });

  it("emits a provider-observed order creation receipt for an identity-bearing execution", async () => {
    const operationId = "0ecfcf1c-2a07-4caf-956f-77cbaa2fb83a:create_order";
    const operationTag = shopifyOperationTag(operationId);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ordersFound())
      .mockResolvedValueOnce(ordersFound())
      .mockResolvedValueOnce(orderCreated(createdOrder(operationTag)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createShopifyOrder({
      email: "jane@example.com",
      address1: "123 Main St",
      city: "Los Angeles",
      province: "CA",
      zip: "90001",
      country: "United States",
      line_items: [{ variant_id: "789", quantity: 1 }],
    }, { ...ctx, operationId, executionId: "execution-create-order-1" });

    expect(result).toMatchObject({
      status: "ok",
      receipt: {
        version: 1,
        operationId,
        executionId: "execution-create-order-1",
        tool: "create_shopify_order",
        target: { kind: "order", id: "456" },
        outcome: "succeeded",
        providerReference: "456",
        facts: {
          orderId: "456",
          orderName: "#1001",
          operationTag,
          financialStatus: "pending",
          adminUrl: "https://test-store.myshopify.com/admin/orders/456",
          totalAmount: "25.00",
          currency: "USD",
        },
      },
    });
  });

  it("keeps an incomplete created order unknown instead of claiming success", async () => {
    const operationId = "0ecfcf1c-2a07-4caf-956f-77cbaa2fb83a:create_order";
    const operationTag = shopifyOperationTag(operationId);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ordersFound())
      .mockResolvedValueOnce(ordersFound())
      .mockResolvedValueOnce(orderCreated(createdOrder(operationTag, { displayFinancialStatus: null })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createShopifyOrder({
      email: "jane@example.com",
      address1: "123 Main St",
      city: "Los Angeles",
      province: "CA",
      zip: "90001",
      country: "United States",
      line_items: [{ variant_id: "789", quantity: 1 }],
    }, { ...ctx, operationId, executionId: "execution-create-order-1" });

    expect(result).toMatchObject({
      status: "unknown",
      receipt: {
        tool: "create_shopify_order",
        target: { kind: "order", id: "456" },
        outcome: "unknown",
        code: "incomplete_created_order",
        providerReference: "456",
      },
    });
  });

  it.each([429, 503])("reconciles an order that committed before Shopify returned %i", async (status) => {
    const operationId = "0ecfcf1c-2a07-4caf-956f-77cbaa2fb83a:create_order";
    const operationTag = shopifyOperationTag(operationId);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ordersFound())
      .mockResolvedValueOnce(ordersFound())
      .mockResolvedValueOnce(jsonResponse({ errors: "ambiguous provider response" }, { status }))
      .mockResolvedValueOnce(ordersFound(createdOrder(operationTag)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createShopifyOrder({
      email: "jane@example.com",
      address1: "123 Main St",
      city: "Los Angeles",
      province: "CA",
      zip: "90001",
      country: "United States",
      line_items: [{ variant_id: "789", quantity: 1 }],
    }, { ...ctx, operationId, executionId: "execution-create-order-1" });

    expect(result.status).toBe("ok");
    expect(result.message).toContain("confirmed after an interrupted provider response");
    expect(result.receipt).toMatchObject({
      outcome: "succeeded",
      providerReference: "456",
      facts: { orderId: "456", operationTag, financialStatus: "pending" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(operations(fetchMock).filter((operation) => operation === "ShopkeeperOrderCreate")).toHaveLength(1);
  });

  it("returns a known provider rejection without attempting ambiguous reconciliation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ordersFound())
      .mockResolvedValueOnce(ordersFound())
      .mockResolvedValueOnce(graphqlResponse({
        orderCreate: { order: null, userErrors: [{ field: ["order", "email"], message: "Email is invalid" }] },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createShopifyOrder({
      email: "jane@example.com",
      address1: "123 Main St",
      city: "Los Angeles",
      province: "CA",
      zip: "90001",
      country: "United States",
      line_items: [{ variant_id: "789", quantity: 1 }],
    }, {
      ...ctx,
      operationId: "execution:create_order",
      executionId: "execution-create-order-1",
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("failed to create order - Email is invalid");
    expect(result.receipt).toMatchObject({
      tool: "create_shopify_order",
      target: { kind: "email", id: "jane@example.com" },
      outcome: "failed",
      code: "provider_rejected_creation",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns unknown instead of replaying order creation when reconciliation cannot confirm it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ordersFound())
      .mockResolvedValueOnce(ordersFound())
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(ordersFound())
      .mockResolvedValueOnce(ordersFound());
    vi.stubGlobal("fetch", fetchMock);

    const result = await createShopifyOrder({
      email: "jane@example.com",
      address1: "123 Main St",
      city: "Los Angeles",
      province: "CA",
      zip: "90001",
      country: "United States",
      line_items: [{ variant_id: "789", quantity: 1 }],
    }, {
      ...ctx,
      operationId: "execution:create_order",
      executionId: "execution-create-order-1",
    });

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("Do not retry or confirm it to the customer");
    expect(result.receipt).toMatchObject({
      tool: "create_shopify_order",
      target: { kind: "email", id: "jane@example.com" },
      outcome: "unknown",
      code: "creation_not_confirmed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(operations(fetchMock).filter((operation) => operation === "ShopkeeperOrderCreate")).toHaveLength(1);
  });

  it("returns a previously created order without issuing another create request", async () => {
    const operationId = "0ecfcf1c-2a07-4caf-956f-77cbaa2fb83a:create_order";
    const operationTag = shopifyOperationTag(operationId);
    const fetchMock = vi.fn().mockResolvedValueOnce(ordersFound(createdOrder(operationTag)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createShopifyOrder({
      email: "jane@example.com",
      address1: "123 Main St",
      city: "Los Angeles",
      province: "CA",
      zip: "90001",
      country: "United States",
      line_items: [{ variant_id: "789", quantity: 1 }],
    }, { ...ctx, operationId });

    expect(result.status).toBe("ok");
    expect(result.message).toContain("confirmed after an interrupted provider response");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
