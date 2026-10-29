import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { probeUnknownShopifyMutation } from "./reconciliation-probes/index.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
  operationId: "execution-1:refund_step",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("probeUnknownShopifyMutation", () => {

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

  it("stays unknown when multiple fulfillments carry the same tracking number", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse(0))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          order: {
            fulfillments: [
              { id: "gid://shopify/Fulfillment/1", status: "SUCCESS", trackingInfo: [{ number: "TRACK-123" }] },
              { id: "gid://shopify/Fulfillment/2", status: "SUCCESS", trackingInfo: [{ number: "TRACK-123" }] },
            ],
          },
        },
      })));

    const result = await probeUnknownShopifyMutation(
      "fulfill_order",
      { order_id: "456", tracking_number: "TRACK-123" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(result.message).toContain("Multiple fulfillments");
  });

  it("stays unknown when nothing remains fulfillable but no fulfillment carries the tracking number", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse(0))
      .mockResolvedValueOnce(jsonResponse({
        data: { order: { fulfillments: [] } },
      })));

    const result = await probeUnknownShopifyMutation(
      "fulfill_order",
      { order_id: "456", tracking_number: "TRACK-123" },
      ctx,
    );

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(result.message).toContain("nothing left to fulfill");
  });

  it("stays unknown when Shopify does not return returnable items during reconciliation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: { order: null } })));

    const result = await probeUnknownShopifyMutation("create_return", { order_id: "456" }, ctx);

    expect(result).toMatchObject({ outcome: "still_unknown" });
    expect(result.message).toContain("was not returned by Shopify");
  });
});
