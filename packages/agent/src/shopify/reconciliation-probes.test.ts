import { afterEach, describe, expect, it, vi } from "vitest";
import { shopifyIdempotencyKey, shopifyOperationTag } from "./client.js";
import { discountCodeForOperation } from "./discounts.js";
import { probeUnknownShopifyMutation } from "./reconciliation-probes.js";

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

const giftCardInput = { amount: "25.00", customer_id: "123" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("probeUnknownShopifyMutation", () => {
  it("commits when the deterministic discount code exists", async () => {
    const code = discountCodeForOperation(10, ctx.operationId);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        codeDiscountNodeByCode: {
          id: "gid://shopify/DiscountCodeNode/1",
          codeDiscount: { codes: { nodes: [{ code }] } },
        },
      },
    })));

    const result = await probeUnknownShopifyMutation(
      "issue_discount",
      { percentage: 10 },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed" });
    expect(result.message).toContain(code);
  });

  it("does not rule out a discount from an empty search result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: { codeDiscountNodeByCode: null },
    })));

    const result = await probeUnknownShopifyMutation(
      "issue_discount",
      { percentage: 10 },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
  });

  it("commits when a matching refund exists on the order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      refunds: [{
        id: 1,
        transactions: [{ status: "success", amount: "20.00" }],
      }],
    })));

    const result = await probeUnknownShopifyMutation(
      "create_refund",
      { order_id: "456", amount: "20.00" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed", spentCents: 2000 });
  });

  it("releases cancellation reconciliation when the order is not cancelled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      order: { id: 456, name: "#1001", cancelled_at: null },
    })));

    const result = await probeUnknownShopifyMutation(
      "cancel_order",
      { order_id: "456", reason: "customer" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "no_effect" });
  });

  // Recorded from palette-dev after a real storeCreditAccountCredit: the credit
  // it produces carries event ADJUSTMENT, so a probe keyed on event "CREDIT"
  // called a committed credit no_effect.
  it("commits a store credit whose event is ADJUSTMENT", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        customer: {
          storeCreditAccounts: {
            nodes: [{
              transactions: {
                nodes: [{
                  __typename: "StoreCreditAccountCreditTransaction",
                  amount: { amount: "0.01" },
                  event: "ADJUSTMENT",
                }],
              },
            }],
          },
        },
      },
    })));

    const result = await probeUnknownShopifyMutation(
      "issue_store_credit",
      { customer_id: "9071668134122", amount: "0.01" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed", spentCents: 1 });
  });

  it("does not read a store-credit debit as the credit it was asked to reconcile", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        customer: {
          storeCreditAccounts: {
            nodes: [{
              transactions: {
                nodes: [{
                  __typename: "StoreCreditAccountDebitTransaction",
                  amount: { amount: "0.01" },
                  event: "ORDER_PAYMENT",
                }],
              },
            }],
          },
        },
      },
    })));

    const result = await probeUnknownShopifyMutation(
      "issue_store_credit",
      { customer_id: "9071668134122", amount: "0.01" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "no_effect" });
  });

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

  const giftCardOperationId = "execution-1:gift_card";
  const giftCardCode = shopifyIdempotencyKey(giftCardOperationId).replaceAll("-", "").slice(0, 20);

  it("commits a gift card carrying the operation code and amount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        giftCards: {
          nodes: [{
            id: "gid://shopify/GiftCard/1",
            initialValue: { amount: "25.00" },
            note: `Shopkeeper operation: ${giftCardCode}`,
          }],
        },
      },
    })));

    const result = await probeUnknownShopifyMutation(
      "create_gift_card",
      giftCardInput,
      { ...ctx, operationId: giftCardOperationId },
    );

    expect(result).toMatchObject({ outcome: "committed", spentCents: 2500 });
  });

  // The code is per-operation, so an unrelated card of the same value is not
  // this operation's card.
  it("does not read another gift card of the same value as this operation's", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          giftCards: {
            nodes: [{
              id: "gid://shopify/GiftCard/2",
              initialValue: { amount: "25.00" },
              note: "Goodwill for a late delivery",
            }],
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ data: { giftCards: { nodes: [] } } })));

    const result = await probeUnknownShopifyMutation(
      "create_gift_card",
      giftCardInput,
      { ...ctx, operationId: giftCardOperationId },
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
  });

  it("falls back to recent cards when Shopify code search misses a committed card", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { giftCards: { nodes: [] } } }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          giftCards: {
            nodes: [{
              id: "gid://shopify/GiftCard/1",
              initialValue: { amount: "25.00" },
              note: `Shopkeeper operation: ${giftCardCode}`,
              lastCharacters: giftCardCode.slice(-4),
            }],
          },
        },
      })));

    const result = await probeUnknownShopifyMutation(
      "create_gift_card",
      giftCardInput,
      { ...ctx, operationId: giftCardOperationId },
    );

    expect(result).toMatchObject({ outcome: "committed", spentCents: 2500 });
  });

  it("cannot reconcile a gift card without a stable operation identity", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeUnknownShopifyMutation(
      "create_gift_card",
      giftCardInput,
      { ...ctx, operationId: undefined },
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(fetchMock).not.toHaveBeenCalled();
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

  const returnableItemsResponse = (items: number) => jsonResponse({
    data: {
      order: { id: "gid://shopify/Order/456" },
      returnableFulfillments: {
        edges: items === 0 ? [] : [{
          node: {
            returnableFulfillmentLineItems: {
              edges: [{
                node: {
                  quantity: items,
                  fulfillmentLineItem: {
                    id: "gid://shopify/FulfillmentLineItem/1",
                    lineItem: { name: "Canary tee", variant: { id: "gid://shopify/ProductVariant/77" } },
                  },
                },
              }],
            },
          },
        }],
      },
    },
  });

  const returnsResponse = (returns: Array<{ status: string; tracking?: string[] }>) => jsonResponse({
    data: {
      order: {
        returns: {
          edges: returns.map((entry, index) => ({
            node: {
              id: `gid://shopify/Return/${index + 1}`,
              name: `#1001-R${index + 1}`,
              status: entry.status,
              reverseFulfillmentOrders: {
                edges: [{
                  node: {
                    reverseDeliveries: {
                      edges: (entry.tracking ?? []).map((number) => ({
                        node: { deliverable: { tracking: { number } } },
                      })),
                    },
                  },
                }],
              },
            },
          })),
        },
      },
    },
  });

  it("commits a return once the requested items are no longer returnable", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(returnableItemsResponse(0))
      .mockResolvedValueOnce(returnsResponse([{ status: "OPEN" }])));

    const result = await probeUnknownShopifyMutation("create_return", { order_id: "456" }, ctx);

    expect(result).toMatchObject({ outcome: "committed" });
    expect(result.message).toContain("#1001-R1");
  });

  // The reading that a bare "the order has an open return" test would get wrong:
  // a return that was already there, on other items, while ours never ran.
  it("does not read a pre-existing open return as the one it was asked to reconcile", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(returnableItemsResponse(1))
      .mockResolvedValueOnce(returnsResponse([{ status: "OPEN" }])));

    const result = await probeUnknownShopifyMutation("create_return", { order_id: "456" }, ctx);

    expect(result).toMatchObject({ outcome: "still_unknown" });
  });

  it("rules a return out while its items are still returnable and nothing is open", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(returnableItemsResponse(1))
      .mockResolvedValueOnce(returnsResponse([])));

    const result = await probeUnknownShopifyMutation("create_return", { order_id: "456" }, ctx);

    expect(result).toMatchObject({ outcome: "no_effect" });
  });

  // A variant filter narrows what createReturn asks for, so the leftover items it
  // never requested must not read as evidence the return failed.
  it("ignores returnable items outside the requested variant", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(returnableItemsResponse(1))
      .mockResolvedValueOnce(returnsResponse([{ status: "OPEN" }])));

    const result = await probeUnknownShopifyMutation(
      "create_return",
      { order_id: "456", variant_id: "999" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed" });
  });

  it("reconciles an exchange through the return it opens", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(returnableItemsResponse(1))
      .mockResolvedValueOnce(returnsResponse([{ status: "OPEN" }])));

    const result = await probeUnknownShopifyMutation(
      "create_exchange",
      {
        order_id: "456",
        variant_id: "999",
        exchange_variant_id: "1000",
        quantity: 1,
      },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed" });
  });

  it("commits a return label carrying this call's tracking number", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      returnsResponse([{ status: "OPEN", tracking: ["SKCANARY1"] }]),
    ));

    const result = await probeUnknownShopifyMutation(
      "attach_return_label",
      { order_id: "456", label_url: "https://example.com/label.pdf", tracking_number: "SKCANARY1" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed" });
  });

  it("does not read another delivery's tracking number as this call's", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      returnsResponse([{ status: "OPEN", tracking: ["SOMEONE-ELSE"] }]),
    ));

    const result = await probeUnknownShopifyMutation(
      "attach_return_label",
      { order_id: "456", label_url: "https://example.com/label.pdf", tracking_number: "SKCANARY1" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
  });

  // Never no_effect: clearing this action is what sends the customer a second
  // label, and an absent delivery is an absence like every other probe defect
  // this package has found.
  it("never rules a return label out from an absent reverse delivery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(returnsResponse([{ status: "OPEN" }])));

    const result = await probeUnknownShopifyMutation(
      "attach_return_label",
      { order_id: "456", label_url: "https://example.com/label.pdf", tracking_number: "SKCANARY1" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
  });

  it("cannot reconcile a return label sent without a tracking number", async () => {
    const fetchMock = vi.fn().mockResolvedValue(returnsResponse([{ status: "OPEN", tracking: ["SKCANARY1"] }]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeUnknownShopifyMutation(
      "attach_return_label",
      { order_id: "456", label_url: "https://example.com/label.pdf" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const fulfillmentOrdersResponse = (remainingQuantity: number) => jsonResponse({
    data: {
      order: {
        id: "gid://shopify/Order/456",
        fulfillmentOrders: {
          edges: remainingQuantity > 0 ? [{
            node: {
              id: "gid://shopify/FulfillmentOrder/1",
              status: "OPEN",
              lineItems: {
                edges: [{
                  node: {
                    id: "gid://shopify/FulfillmentOrderLineItem/1",
                    remainingQuantity,
                    lineItem: { name: "Canary tee" },
                  },
                }],
              },
            },
          }] : [],
        },
      },
    },
  });

  it("commits an untracked fulfillment when nothing remains fulfillable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fulfillmentOrdersResponse(0)));

    const result = await probeUnknownShopifyMutation(
      "fulfill_order",
      { order_id: "456" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed" });
  });

  it("rules out an untracked fulfillment while items remain fulfillable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fulfillmentOrdersResponse(1)));

    const result = await probeUnknownShopifyMutation(
      "fulfill_order",
      { order_id: "456" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "no_effect" });
  });

  it("commits a fulfillment carrying this call's tracking number", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse(0))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          order: {
            fulfillments: [{
              id: "gid://shopify/Fulfillment/1",
              status: "SUCCESS",
              trackingInfo: [{ number: "TRACK-123" }],
            }],
          },
        },
      })));

    const result = await probeUnknownShopifyMutation(
      "fulfill_order",
      { order_id: "456", tracking_number: "TRACK-123" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "committed" });
  });
});
