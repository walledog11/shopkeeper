import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { shopifyOperationTag } from "./client.js";
import { probeUnknownShopifyMutation } from "./reconciliation-probes/index.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
  operationId: "execution-1:refund_step",
};

const createdOrderInput = {
  email: "buyer@example.com",
  first_name: "Test",
  last_name: "Buyer",
  address1: "1 Main St",
  city: "San Francisco",
  province: "CA",
  zip: "94105",
  country: "US",
  line_items: [{ variant_id: "1", quantity: 1 }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("probeUnknownShopifyMutation", () => {
  // Measured on palette-dev: order #1008 was unfindable by `tag:` after three
  // attempts across four seconds, while REST filtered by email returned it
  // carrying that tag. The direct query is the reconciliation path.
  it("reconciles a created order through the direct email lookup, not search", async () => {
    const tag = shopifyOperationTag("execution-1:create_order");
    const fetchMock = vi.fn(async () => jsonResponse({
      orders: [{ id: 6123346100458, name: "#1008", tags: `some-other-tag, ${tag}` }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeUnknownShopifyMutation(
      "create_shopify_order",
      createdOrderInput,
      { ...ctx, operationId: "execution-1:create_order" },
    );

    expect(result).toMatchObject({ outcome: "committed" });
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("orders.json");
    expect(url).toContain("email=buyer%40example.com");
    expect(url).not.toContain("graphql");
  });

  // REST hands back tags as one comma-separated string, so a tag that is merely
  // a prefix of another must not count as a match.
  it("does not match a tag that is only a prefix of the order's tag", async () => {
    vi.useFakeTimers();
    try {
      const tag = shopifyOperationTag("execution-1:create_order");
      vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
        orders: [{ id: 1, name: "#1008", tags: `${tag}-extra` }],
      })));

      const pending = probeUnknownShopifyMutation(
        "create_shopify_order",
        createdOrderInput,
        { ...ctx, operationId: "execution-1:create_order" },
      );
      const [result] = await Promise.all([pending, vi.runAllTimersAsync()]);

      expect(result.outcome).toBe("still_unknown");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects incomplete persisted order input before querying Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeUnknownShopifyMutation(
      "create_shopify_order",
      { line_items: [{ variant_id: "1", quantity: 1 }] },
      { ...ctx, operationId: "execution-1:create_order" },
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(result.message).toContain("input.email is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The defect this guards: reporting a confident no_effect for an order that
  // may exist releases the hold, and the next move is a duplicate real order.
  it("never rules a created order out from an exhausted search", async () => {
    vi.useFakeTimers();
    try {
      // A Response body reads once, so each attempt needs its own instance -
      // mockResolvedValue would hand attempt 2 an already-consumed body.
      const fetchMock = vi.fn(async () => jsonResponse({ orders: [] }));
      vi.stubGlobal("fetch", fetchMock);

      const pending = probeUnknownShopifyMutation(
        "create_shopify_order",
        createdOrderInput,
        { ...ctx, operationId: "execution-1:create_order" },
      );
      const [result] = await Promise.all([pending, vi.runAllTimersAsync()]);

      expect(result.outcome).toBe("still_unknown");
      expect(result.outcome).not.toBe("no_effect");
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  function orderLineItemsResponse(lineItems: Array<{ variant_id: number; quantity: number }>): Response {
    return jsonResponse({
      order: {
        id: 456,
        name: "#1001",
        line_items: lineItems.map((item, index) => ({ id: index + 1, ...item })),
      },
    });
  }

  it("rules out an order-edit add when the variant is absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(orderLineItemsResponse([
      { variant_id: 111, quantity: 1 },
    ])));

    const result = await probeUnknownShopifyMutation(
      "edit_shopify_order",
      { order_id: "456", variant_id: "222", quantity: 2 },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "no_effect" });
  });

  // The defect this replaces: the probe compared the line against the requested
  // delta with `>=`, so an order already carrying enough of the variant read as
  // a committed edit that had never run.
  it("does not read a pre-existing line as evidence the add committed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(orderLineItemsResponse([
      { variant_id: 222, quantity: 3 },
    ])));

    const result = await probeUnknownShopifyMutation(
      "edit_shopify_order",
      { order_id: "456", variant_id: "222", quantity: 2 },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
  });

  it("commits an order-edit removal once the variant is gone", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(orderLineItemsResponse([
      { variant_id: 111, quantity: 1 },
    ])));

    const result = await probeUnknownShopifyMutation(
      "edit_shopify_order",
      { order_id: "456", remove_variant_id: "222" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed" });
  });

  // A swap is one edit. The removal landing tells us nothing about the add, and
  // half an edit must not report as a committed one.
  it("does not report a swap as committed on the removal alone", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(orderLineItemsResponse([
      { variant_id: 333, quantity: 1 },
    ])));

    const result = await probeUnknownShopifyMutation(
      "edit_shopify_order",
      { order_id: "456", variant_id: "333", quantity: 1, remove_variant_id: "222" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
  });

  it("rules out a swap when neither half is reflected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(orderLineItemsResponse([
      { variant_id: 222, quantity: 1 },
    ])));

    const result = await probeUnknownShopifyMutation(
      "edit_shopify_order",
      { order_id: "456", variant_id: "333", quantity: 1, remove_variant_id: "222" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "no_effect" });
  });

  const addressInput = {
    order_id: "456",
    customer_id: "789",
    address1: "12  Bridge  St",
    city: "Brooklyn",
    province: "NY",
    zip: "11201",
    country: "US",
  };

  // Shopify echoes a country as its full name with the code alongside. Comparing
  // the input's "US" against `country` alone read every committed update on a
  // country-code input as a no-op.
  it("commits an address update Shopify echoes with a country name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      order: {
        id: 456,
        name: "#1001",
        shipping_address: {
          address1: "12 Bridge St",
          city: "Brooklyn",
          province: "New York",
          province_code: "NY",
          zip: "11201",
          country: "United States",
          country_code: "US",
        },
      },
    })));

    const result = await probeUnknownShopifyMutation(
      "update_shopify_order_address",
      addressInput,
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed" });
  });

  it("rules out an address update the order does not carry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      order: {
        id: 456,
        name: "#1001",
        shipping_address: {
          address1: "88 Old Road",
          city: "Queens",
          province: "New York",
          province_code: "NY",
          zip: "11375",
          country: "United States",
          country_code: "US",
        },
      },
    })));

    const result = await probeUnknownShopifyMutation(
      "update_shopify_order_address",
      addressInput,
      ctx,
    );

    expect(result).toMatchObject({ outcome: "no_effect" });
  });

  // The street matched; the province did not. The old comparison never looked at
  // province at all.
  it("rules out an address update that landed in the wrong province", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      order: {
        id: 456,
        name: "#1001",
        shipping_address: {
          address1: "12 Bridge St",
          city: "Brooklyn",
          province: "New Jersey",
          province_code: "NJ",
          zip: "11201",
          country: "United States",
          country_code: "US",
        },
      },
    })));

    const result = await probeUnknownShopifyMutation(
      "update_shopify_order_address",
      addressInput,
      ctx,
    );

    expect(result).toMatchObject({ outcome: "no_effect" });
  });

  it("observes a committed customer-info update without fabricating receipt facts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      customer: { id: 123, first_name: "Jane", email: "jane@example.com" },
    })));

    const result = await probeUnknownShopifyMutation(
      "update_shopify_customer_info",
      { customer_id: "123", first_name: "Jane", email: "JANE@example.com" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed" });
  });

  it("keeps a mismatched customer-info update unknown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      customer: { id: 123, first_name: "Old" },
    })));

    const result = await probeUnknownShopifyMutation(
      "update_shopify_customer_info",
      { customer_id: "123", first_name: "Jane" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
  });

  it("does not promote an observed customer note without the append receipt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      customer: { id: 123, note: "Existing\n\nFollow up" },
    })));

    const result = await probeUnknownShopifyMutation(
      "add_shopify_customer_note",
      { customer_id: "123", note: "Follow up" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(result.message).toContain("present");
  });

  it("cannot reconcile an order edit without variant identifiers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      order: { id: 456, name: "#1001", line_items: [] },
    })));

    const result = await probeUnknownShopifyMutation(
      "edit_shopify_order",
      { order_id: "456" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(result.message).toContain("requires variant_id or remove_variant_id");
  });

  it("stays unknown when Shopify does not return the order during an edit probe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    const result = await probeUnknownShopifyMutation(
      "edit_shopify_order",
      { order_id: "456", variant_id: "222", quantity: 1 },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(result.message).toContain("was not returned by Shopify");
  });
});
