import { afterEach, describe, expect, it, vi } from "vitest";
import { updateShopifyOrderAddress } from "./order-address.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("already fulfilled or partially fulfilled");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks a mismatched order and customer before either mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      order: order(oldAddress, { customer: { id: 999 } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateShopifyOrderAddress(input, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("customer 123 does not own order #1001");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
