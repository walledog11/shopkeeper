import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import {
  graphqlRequest,
  graphqlResponse,
  shopifyMailingAddressNode,
  shopifyOrderNode,
} from "../testing/shopify-graphql.js";
import { updateShopifyOrderAddress } from "./order-address.js";
import type { ShopifyCustomerAddress, ShopifyOrder } from "./types.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

const receiptCtx = {
  ...ctx,
  operationId: "order-address-operation-1",
  executionId: "order-address-execution-1",
};

const input = {
  order_id: "456",
  customer_id: "123",
  address1: "123 Main St",
  city: "Los Angeles",
  province: "CA",
  zip: "90001",
  country: "United States",
};

const oldAddress = {
  address1: "10 Old St",
  city: "Los Angeles",
  province: "CA",
  zip: "90002",
  country: "United States",
};

const requestedAddress = {
  address1: "123 Main St",
  city: "Los Angeles",
  province: "California",
  province_code: "CA",
  zip: "90001",
  country: "United States",
  country_code: "US",
};

function order(address: ShopifyCustomerAddress, overrides: Record<string, unknown> = {}): ShopifyOrder {
  return {
    id: 456,
    name: "#1001",
    fulfillment_status: null,
    customer: { id: 123 },
    shipping_address: address,
    ...overrides,
  } as ShopifyOrder;
}

// Shopify's answer to the order read.
function orderRead(address: ShopifyCustomerAddress = oldAddress, overrides: Record<string, unknown> = {}) {
  return graphqlResponse({ order: shopifyOrderNode(order(address, overrides)) });
}

// Shopify's answer to the customer's default-address read.
function defaultAddressRead(address: ShopifyCustomerAddress | null = { id: 789, ...oldAddress }) {
  return graphqlResponse({ customer: { defaultAddress: address ? shopifyMailingAddressNode(address) : null } });
}

// Shopify accepted the order's new shipping address.
function orderUpdated(address: ShopifyCustomerAddress = requestedAddress) {
  return graphqlResponse({
    orderUpdate: {
      order: { legacyResourceId: "456", name: "#1001", shippingAddress: shopifyOrderNode(order(address)).shippingAddress },
      userErrors: [],
    },
  });
}

// Shopify accepted the customer's new default address.
function customerAddressUpdated(address: ShopifyCustomerAddress = { id: 789, ...requestedAddress }) {
  return graphqlResponse({ customerAddressUpdate: { address: shopifyMailingAddressNode(address), userErrors: [] } });
}

function operations(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([, init]) => graphqlRequest(init as RequestInit)?.operation);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("updateShopifyOrderAddress", () => {
  it("updates the order and customer default address", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead())
      .mockResolvedValueOnce(defaultAddressRead())
      .mockResolvedValueOnce(orderUpdated())
      .mockResolvedValueOnce(customerAddressUpdated());
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("shipping address updated");
    expect(result.message).toContain("Customer profile also updated");
    expect(operations(fetchMock)).toEqual([
      "ShopkeeperOrder",
      "ShopkeeperCustomerDefaultAddress",
      "ShopkeeperOrderShippingAddressUpdate",
      "ShopkeeperCustomerAddressUpdate",
    ]);
    const sent = { address1: "123 Main St", city: "Los Angeles", province: "CA", zip: "90001", country: "United States" };
    expect(graphqlRequest(fetchMock.mock.calls[2]![1])!.variables).toEqual({
      input: { id: "gid://shopify/Order/456", shippingAddress: sent },
    });
    expect(graphqlRequest(fetchMock.mock.calls[3]![1])!.variables).toEqual({
      customerId: "gid://shopify/Customer/123",
      addressId: "gid://shopify/MailingAddress/789?model_name=CustomerAddress",
      address: sent,
    });
  });

  it("confirms an ambiguous order update with a follow-up read", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead())
      .mockResolvedValueOnce(defaultAddressRead({ id: 789, ...requestedAddress }))
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(orderRead(requestedAddress));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("Confirmed after an interrupted provider response");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("reconciles a connection loss after Shopify commits the order update", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead())
      .mockResolvedValueOnce(defaultAddressRead({ id: 789, ...requestedAddress }))
      .mockRejectedValueOnce(new TypeError("socket closed after request write"))
      .mockResolvedValueOnce(orderRead(requestedAddress));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("Confirmed after an interrupted provider response");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("treats a 429 mutation response as ambiguous instead of replaying the mutation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead())
      .mockResolvedValueOnce(defaultAddressRead({ id: 789, ...requestedAddress }))
      .mockResolvedValueOnce(jsonResponse({ errors: "throttled after commit" }, 429))
      .mockResolvedValueOnce(orderRead(requestedAddress));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(operations(fetchMock).filter((operation) => operation === "ShopkeeperOrderShippingAddressUpdate"))
      .toHaveLength(1);
  });

  it("returns unknown when an ambiguous order update cannot be confirmed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead())
      .mockResolvedValueOnce(defaultAddressRead())
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(orderRead());
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("may have committed at Shopify");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("confirms an ambiguous customer update with a follow-up read", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead())
      .mockResolvedValueOnce(defaultAddressRead())
      .mockResolvedValueOnce(orderUpdated())
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(defaultAddressRead({ id: 789, ...requestedAddress }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("Customer profile also updated (confirmed after an interrupted provider response)");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("returns unknown when an ambiguous customer update cannot be confirmed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead())
      .mockResolvedValueOnce(defaultAddressRead())
      .mockResolvedValueOnce(orderUpdated())
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(defaultAddressRead());
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("customer-profile address update may also have committed");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("is a provider no-op when both stored addresses already match", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead(requestedAddress))
      .mockResolvedValueOnce(defaultAddressRead({ id: 789, ...requestedAddress }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("already matched the requested address");
    expect(operations(fetchMock)).toEqual(["ShopkeeperOrder", "ShopkeeperCustomerDefaultAddress"]);
  });

  it("blocks fulfilled orders before either mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(orderRead(oldAddress, { fulfillment_status: "fulfilled" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, receiptCtx);

    expect(result.status).toBe("policy_block");
    expect(result.message).toContain("already fulfilled or partially fulfilled");
    expect(result.receipt).toMatchObject({ outcome: "rejected", code: "order_already_fulfilled" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks a mismatched order and customer before either mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(orderRead(oldAddress, { customer: { id: 999 } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, receiptCtx);

    expect(result.status).toBe("policy_block");
    expect(result.message).toContain("customer 123 does not own order #1001");
    expect(result.receipt).toMatchObject({ outcome: "rejected", code: "customer_order_mismatch" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("records provider-confirmed order and customer address facts on success", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead())
      .mockResolvedValueOnce(defaultAddressRead())
      .mockResolvedValueOnce(orderUpdated())
      .mockResolvedValueOnce(customerAddressUpdated());
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, receiptCtx);

    expect(result.status).toBe("ok");
    expect(result.receipt).toMatchObject({
      version: 1,
      tool: "update_shopify_order_address",
      outcome: "succeeded",
      operationId: "order-address-operation-1",
      executionId: "order-address-execution-1",
      target: { kind: "order", id: "456" },
      providerReference: "456",
      facts: {
        orderId: "456",
        customerId: "123",
        orderAddress: {
          outcome: "updated",
          address: {
            address1: "123 Main St",
            city: "Los Angeles",
            province: "California",
            provinceCode: "CA",
            postalCode: "90001",
            country: "United States",
            countryCode: "US",
          },
        },
        customerDefaultAddress: { outcome: "updated", addressId: "789" },
      },
    });
  });

  // The provider address is the observed one, not the requested one: Shopify
  // normalizes province and country, and a receipt that echoed the input would
  // report a value no provider ever confirmed.
  it("reports the provider-normalized address rather than the requested input", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead())
      .mockResolvedValueOnce(defaultAddressRead())
      .mockResolvedValueOnce(orderUpdated())
      .mockResolvedValueOnce(customerAddressUpdated());
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, receiptCtx);

    expect(input.province).toBe("CA");
    expect(result.receipt).toMatchObject({
      facts: { orderAddress: { address: { province: "California", provinceCode: "CA" } } },
    });
  });

  it("distinguishes an already-matching address from a fresh write", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead(requestedAddress))
      .mockResolvedValueOnce(defaultAddressRead({ id: 789, ...requestedAddress }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, receiptCtx);

    expect(result.status).toBe("ok");
    expect(result.receipt).toMatchObject({
      outcome: "succeeded",
      facts: {
        orderAddress: { outcome: "already_matched" },
        customerDefaultAddress: { outcome: "already_matched", addressId: "789" },
      },
    });
  });

  it("records a customer with no default address as not updated rather than failed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead())
      .mockResolvedValueOnce(defaultAddressRead(null))
      .mockResolvedValueOnce(orderUpdated());
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, receiptCtx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("no default address exists");
    expect(result.receipt).toMatchObject({
      outcome: "succeeded",
      facts: {
        orderAddress: { outcome: "updated" },
        customerDefaultAddress: { outcome: "not_updated", code: "no_default_address" },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // The compound write is the whole reason this capability needs typed facts:
  // the order address committed and the customer profile did not, so an
  // outcome-only receipt would erase the half that succeeded.
  it("keeps the committed order address visible when the customer sync fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead())
      .mockResolvedValueOnce(defaultAddressRead())
      .mockResolvedValueOnce(orderUpdated())
      .mockResolvedValueOnce(graphqlResponse({
        customerAddressUpdate: { address: null, userErrors: [{ field: ["address", "zip"], message: "Zip is invalid" }] },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, receiptCtx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("Zip is invalid");
    expect(result.receipt).toMatchObject({
      outcome: "unknown",
      code: "customer_sync_failed_after_order_update",
      facts: {
        orderAddress: { outcome: "updated", address: { address1: "123 Main St" } },
        customerDefaultAddress: { outcome: "failed", code: "customer_sync_failed_after_order_update" },
      },
    });
  });

  it("preserves an unconfirmed customer update as unknown with the order address intact", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead())
      .mockResolvedValueOnce(defaultAddressRead())
      .mockResolvedValueOnce(orderUpdated())
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(defaultAddressRead());
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, receiptCtx);

    expect(result.status).toBe("unknown");
    expect(result.receipt).toMatchObject({
      outcome: "unknown",
      code: "customer_address_unconfirmed",
      facts: {
        orderAddress: { outcome: "updated" },
        customerDefaultAddress: { outcome: "unknown", code: "customer_address_unconfirmed" },
      },
    });
  });

  it("reports a missing order as not found rather than a generic failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(graphqlResponse({ order: null })));

    const result = await updateShopifyOrderAddress(input, receiptCtx);

    expect(result.status).toBe("not_found");
    expect(result.receipt).toMatchObject({ outcome: "not_found", code: "order_not_found" });
  });

  it("reports invalid address input as a rejection, not a provider failure", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress({ ...input, city: "  " }, receiptCtx);

    expect(result.status).toBe("policy_block");
    expect(result.receipt).toMatchObject({ outcome: "rejected", code: "invalid_address_input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("carries no receipt when the caller supplies no durable operation identity", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderRead())
      .mockResolvedValueOnce(defaultAddressRead())
      .mockResolvedValueOnce(orderUpdated())
      .mockResolvedValueOnce(customerAddressUpdated());
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("ok");
    expect(result.receipt).toBeUndefined();
  });
});
