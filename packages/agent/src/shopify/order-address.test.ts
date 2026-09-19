import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { updateShopifyOrderAddress } from "./order-address.js";

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

function order(address = oldAddress, overrides: Record<string, unknown> = {}) {
  return {
    id: 456,
    name: "#1001",
    order_number: 1001,
    fulfillment_status: null,
    customer: { id: 123 },
    shipping_address: address,
    ...overrides,
  };
}

function customer(address = { id: 789, ...oldAddress }) {
  return { id: 123, default_address: address };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("updateShopifyOrderAddress", () => {
  it("updates the order and customer default address", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: order() }))
      .mockResolvedValueOnce(jsonResponse({ customer: customer() }))
      .mockResolvedValueOnce(jsonResponse({ order: order(requestedAddress) }))
      .mockResolvedValueOnce(jsonResponse({ customer_address: { id: 789, ...requestedAddress } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("shipping address updated");
    expect(result.message).toContain("Customer profile also updated");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("confirms an ambiguous order update with a follow-up read", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: order() }))
      .mockResolvedValueOnce(jsonResponse({ customer: customer({ id: 789, ...requestedAddress }) }))
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(jsonResponse({ order: order(requestedAddress) }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("Confirmed after an interrupted provider response");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("reconciles a connection loss after Shopify commits the order update", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: order() }))
      .mockResolvedValueOnce(jsonResponse({ customer: customer({ id: 789, ...requestedAddress }) }))
      .mockRejectedValueOnce(new TypeError("socket closed after request write"))
      .mockResolvedValueOnce(jsonResponse({ order: order(requestedAddress) }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("Confirmed after an interrupted provider response");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("treats a 429 mutation response as ambiguous instead of replaying the PUT", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: order() }))
      .mockResolvedValueOnce(jsonResponse({ customer: customer({ id: 789, ...requestedAddress }) }))
      .mockResolvedValueOnce(jsonResponse({ errors: "throttled after commit" }, 429))
      .mockResolvedValueOnce(jsonResponse({ order: order(requestedAddress) }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const methods = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).method);
    expect(methods.filter((method) => method === "PUT")).toHaveLength(1);
  });

  it("returns unknown when an ambiguous order update cannot be confirmed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: order() }))
      .mockResolvedValueOnce(jsonResponse({ customer: customer() }))
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(jsonResponse({ order: order() }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("may have committed at Shopify");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("confirms an ambiguous customer update with a follow-up read", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: order() }))
      .mockResolvedValueOnce(jsonResponse({ customer: customer() }))
      .mockResolvedValueOnce(jsonResponse({ order: order(requestedAddress) }))
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(jsonResponse({ customer: customer({ id: 789, ...requestedAddress }) }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("Customer profile also updated (confirmed after an interrupted provider response)");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("returns unknown when an ambiguous customer update cannot be confirmed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: order() }))
      .mockResolvedValueOnce(jsonResponse({ customer: customer() }))
      .mockResolvedValueOnce(jsonResponse({ order: order(requestedAddress) }))
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(jsonResponse({ customer: customer() }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("customer-profile address update may also have committed");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("is a provider no-op when both stored addresses already match", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: order(requestedAddress) }))
      .mockResolvedValueOnce(jsonResponse({ customer: customer({ id: 789, ...requestedAddress }) }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("already matched the requested address");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => (init as RequestInit).method === "GET")).toBe(true);
  });

  it("blocks fulfilled orders before either mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      order: order(oldAddress, { fulfillment_status: "fulfilled" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, receiptCtx);

    expect(result.status).toBe("policy_block");
    expect(result.message).toContain("already fulfilled or partially fulfilled");
    expect(result.receipt).toMatchObject({ outcome: "rejected", code: "order_already_fulfilled" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks a mismatched order and customer before either mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      order: order(oldAddress, { customer: { id: 999 } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, receiptCtx);

    expect(result.status).toBe("policy_block");
    expect(result.message).toContain("customer 123 does not own order #1001");
    expect(result.receipt).toMatchObject({ outcome: "rejected", code: "customer_order_mismatch" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("records provider-confirmed order and customer address facts on success", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: order() }))
      .mockResolvedValueOnce(jsonResponse({ customer: customer() }))
      .mockResolvedValueOnce(jsonResponse({ order: order(requestedAddress) }))
      .mockResolvedValueOnce(jsonResponse({ customer_address: { id: 789, ...requestedAddress } }));
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
      .mockResolvedValueOnce(jsonResponse({ order: order() }))
      .mockResolvedValueOnce(jsonResponse({ customer: customer() }))
      .mockResolvedValueOnce(jsonResponse({ order: order(requestedAddress) }))
      .mockResolvedValueOnce(jsonResponse({ customer_address: { id: 789, ...requestedAddress } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, receiptCtx);

    expect(input.province).toBe("CA");
    expect(result.receipt).toMatchObject({
      facts: { orderAddress: { address: { province: "California", provinceCode: "CA" } } },
    });
  });

  it("distinguishes an already-matching address from a fresh write", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: order(requestedAddress) }))
      .mockResolvedValueOnce(jsonResponse({ customer: customer({ id: 789, ...requestedAddress }) }));
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
      .mockResolvedValueOnce(jsonResponse({ order: order() }))
      .mockResolvedValueOnce(jsonResponse({ customer: { id: 123, default_address: null } }))
      .mockResolvedValueOnce(jsonResponse({ order: order(requestedAddress) }));
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
      .mockResolvedValueOnce(jsonResponse({ order: order() }))
      .mockResolvedValueOnce(jsonResponse({ customer: customer() }))
      .mockResolvedValueOnce(jsonResponse({ order: order(requestedAddress) }))
      .mockResolvedValueOnce(jsonResponse({ errors: "address is invalid" }, 422));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, receiptCtx);

    expect(result.status).toBe("unknown");
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
      .mockResolvedValueOnce(jsonResponse({ order: order() }))
      .mockResolvedValueOnce(jsonResponse({ customer: customer() }))
      .mockResolvedValueOnce(jsonResponse({ order: order(requestedAddress) }))
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(jsonResponse({ customer: customer() }));
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({})));

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
      .mockResolvedValueOnce(jsonResponse({ order: order() }))
      .mockResolvedValueOnce(jsonResponse({ customer: customer() }))
      .mockResolvedValueOnce(jsonResponse({ order: order(requestedAddress) }))
      .mockResolvedValueOnce(jsonResponse({ customer_address: { id: 789, ...requestedAddress } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("ok");
    expect(result.receipt).toBeUndefined();
  });
});
