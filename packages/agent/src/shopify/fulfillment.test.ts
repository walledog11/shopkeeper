import { afterEach, describe, expect, it, vi } from "vitest";
import { fulfillOrder } from "./fulfillment.js";
import { probeUnknownShopifyMutation } from "./reconciliation-probes/index.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fulfillmentOrdersResponse(status = "OPEN", remainingQuantity = 2): Response {
  return jsonResponse({
    data: {
      order: {
        id: "gid://shopify/Order/3001",
        fulfillmentOrders: {
          edges: [
            {
              node: {
                id: "gid://shopify/FulfillmentOrder/88",
                status,
                lineItems: {
                  edges: [
                    {
                      node: {
                        id: "gid://shopify/FulfillmentOrderLineItem/11",
                        remainingQuantity,
                        lineItem: { name: "Wool Scarf" },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    },
  });
}

function fulfillmentCreatedResponse(): Response {
  return jsonResponse({
    data: {
      fulfillmentCreate: {
        fulfillment: {
          id: "gid://shopify/Fulfillment/444",
          status: "SUCCESS",
          totalQuantity: 2,
          trackingInfo: [{ number: "1Z999", company: "UPS", url: null }],
        },
        userErrors: [],
      },
    },
  });
}

const input = { order_id: "3001" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fulfillOrder", () => {
  it("rejects a non-URL tracking_url before calling Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder({ ...input, tracking_url: "not a url" }, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("tracking_url must be a valid URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("errors when the order has nothing left to fulfill", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fulfillmentOrdersResponse("CLOSED"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder(input, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("nothing left to fulfill");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ON_HOLD and SCHEDULED fulfillment orders are refused by fulfillmentCreate,
  // so treating them as fulfillable would send a mutation Shopify always rejects.
  it("does not treat an on-hold fulfillment order as fulfillable", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fulfillmentOrdersResponse("ON_HOLD"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder(input, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("nothing left to fulfill");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips a line item with no remaining quantity", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fulfillmentOrdersResponse("OPEN", 0));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder(input, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("nothing left to fulfill");
  });

  it("creates the fulfillment with tracking on the happy path", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse())
      .mockResolvedValueOnce(fulfillmentCreatedResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder(
      { ...input, tracking_number: "1Z999", tracking_company: "UPS" },
      ctx,
    );

    const request = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(request.variables.fulfillment).toEqual({
      lineItemsByFulfillmentOrder: [
        {
          fulfillmentOrderId: "gid://shopify/FulfillmentOrder/88",
          fulfillmentOrderLineItems: [
            { id: "gid://shopify/FulfillmentOrderLineItem/11", quantity: 2 },
          ],
        },
      ],
      notifyCustomer: true,
      trackingInfo: { number: "1Z999", company: "UPS" },
    });
    expect(result.status).toBe("ok");
    expect(result.message).toContain("2x Wool Scarf");
    expect(result.message).toContain("Tracking 1Z999 via UPS");
  });

  it("omits trackingInfo entirely when no tracking was supplied", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse())
      .mockResolvedValueOnce(fulfillmentCreatedResponse());
    vi.stubGlobal("fetch", fetchMock);

    await fulfillOrder(input, ctx);

    const request = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(request.variables.fulfillment).not.toHaveProperty("trackingInfo");
  });

  // Whether Shopify emailed the customer decides whether the agent's reply is
  // the first notice or a follow-up, so the result has to say which happened.
  it("tells the agent it owns the notification when notify_customer is false", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse())
      .mockResolvedValueOnce(fulfillmentCreatedResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder({ ...input, notify_customer: false }, ctx);

    const request = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(request.variables.fulfillment.notifyCustomer).toBe(false);
    expect(result.message).toContain("did NOT email the customer");
  });

  // A dropped connection after fulfillmentCreate went out can leave the order
  // fulfilled and the customer emailed. Reporting that as a flat failure invites
  // the retry that sends a second shipping notice.
  it("reports an interrupted fulfillment mutation as unknown, not failed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse())
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder(input, ctx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("Do not fulfill again");
  });

  // The lookup runs before any mutation, so its failure committed nothing and
  // must not be laundered into an ambiguous outcome.
  it("keeps a failed fulfillment-order lookup an error", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder(input, ctx);

    expect(result.status).toBe("error");
  });

  it("keeps a rejected document an error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse())
      .mockResolvedValueOnce(jsonResponse({
        errors: [{ message: "Field 'fulfillmentCreate' doesn't exist on type 'Mutation'" }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder(input, ctx);

    expect(result.status).toBe("error");
  });

  it("surfaces a userError as an error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse())
      .mockResolvedValueOnce(jsonResponse({
        data: {
          fulfillmentCreate: {
            fulfillment: null,
            userErrors: [{ field: null, message: "Fulfillment orders are on hold" }],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder(input, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("Fulfillment orders are on hold");
  });
});

function trackingResponse(numbers: string[]): Response {
  return jsonResponse({
    data: {
      order: {
        fulfillments: numbers.map((number, index) => ({
          id: `gid://shopify/Fulfillment/${index}`,
          status: "SUCCESS",
          trackingInfo: [{ number }],
        })),
      },
    },
  });
}

describe("fulfill_order reconciliation probe", () => {
  it("commits when nothing remains fulfillable and no tracking was supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fulfillmentOrdersResponse("CLOSED"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeUnknownShopifyMutation("fulfill_order", input, ctx);

    expect(result.outcome).toBe("committed");
  });

  it("clears the action when the items are still awaiting fulfillment", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fulfillmentOrdersResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeUnknownShopifyMutation("fulfill_order", input, ctx);

    expect(result.outcome).toBe("no_effect");
  });

  it("commits on an exact tracking-number match", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse("CLOSED"))
      .mockResolvedValueOnce(trackingResponse(["1Z999"]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeUnknownShopifyMutation(
      "fulfill_order",
      { ...input, tracking_number: "1Z999" },
      ctx,
    );

    expect(result.outcome).toBe("committed");
    expect(result.message).toContain("1Z999");
  });

  // Nothing left to fulfill proves someone fulfilled it; the absent tracking
  // number proves it was not identifiably this call. Fulfilling again would
  // send a second shipping notice, so this must not clear.
  it("stays unknown when the order is fulfilled but carries different tracking", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse("CLOSED"))
      .mockResolvedValueOnce(trackingResponse(["9999"]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeUnknownShopifyMutation(
      "fulfill_order",
      { ...input, tracking_number: "1Z999" },
      ctx,
    );

    expect(result.outcome).toBe("still_unknown");
  });

  it("stays unknown when two fulfillments carry the same tracking number", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse("CLOSED"))
      .mockResolvedValueOnce(trackingResponse(["1Z999", "1Z999"]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeUnknownShopifyMutation(
      "fulfill_order",
      { ...input, tracking_number: "1Z999" },
      ctx,
    );

    expect(result.outcome).toBe("still_unknown");
  });

  it("stays unknown when the order cannot be read back", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: { order: null } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeUnknownShopifyMutation("fulfill_order", input, ctx);

    expect(result.outcome).toBe("still_unknown");
  });
});
