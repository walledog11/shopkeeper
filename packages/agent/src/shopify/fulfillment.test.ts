import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { fulfillOrder } from "./fulfillment.js";
import { probeUnknownShopifyMutation } from "./reconciliation-probes/index.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

const receiptCtx = {
  ...ctx,
  operationId: "fulfillment-operation-1",
  executionId: "fulfillment-execution-1",
};

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
          createdAt: "2026-09-12T08:00:00.000Z",
          totalQuantity: 2,
          trackingInfo: [{ number: "1Z999", company: "UPS", url: null }],
          fulfillmentLineItems: {
            edges: [{
              node: {
                id: "gid://shopify/FulfillmentLineItem/501",
                quantity: 2,
                lineItem: { id: "gid://shopify/LineItem/601" },
              },
            }],
          },
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

    expect(result.status).toBe("policy_block");
    expect(result.message).toContain("tracking_url must be a valid URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when the order has nothing left to fulfill", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fulfillmentOrdersResponse("CLOSED"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder(input, receiptCtx);

    expect(result.status).toBe("policy_block");
    expect(result.message).toContain("nothing left to fulfill");
    expect(result.receipt).toMatchObject({ outcome: "rejected", code: "nothing_fulfillable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("distinguishes a missing order from a rejected fulfillment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      data: { order: null },
    })));

    const result = await fulfillOrder(input, receiptCtx);

    expect(result.status).toBe("not_found");
    expect(result.receipt).toMatchObject({ outcome: "not_found", code: "order_not_found" });
  });

  // ON_HOLD and SCHEDULED fulfillment orders are refused by fulfillmentCreate,
  // so treating them as fulfillable would send a mutation Shopify always rejects.
  it("does not treat an on-hold fulfillment order as fulfillable", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fulfillmentOrdersResponse("ON_HOLD"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder(input, ctx);

    expect(result.status).toBe("policy_block");
    expect(result.message).toContain("nothing left to fulfill");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips a line item with no remaining quantity", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fulfillmentOrdersResponse("OPEN", 0));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder(input, ctx);

    expect(result.status).toBe("policy_block");
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

  it("records provider-confirmed fulfillment facts independently of display wording", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse())
      .mockResolvedValueOnce(fulfillmentCreatedResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder(
      { ...input, tracking_number: "REQUESTED", notify_customer: false },
      receiptCtx,
    );

    expect(result).toMatchObject({
      status: "ok",
      receipt: {
        version: 1,
        operationId: "fulfillment-operation-1",
        executionId: "fulfillment-execution-1",
        tool: "fulfill_order",
        target: { kind: "order", id: "3001" },
        outcome: "succeeded",
        providerReference: "gid://shopify/Fulfillment/444",
        facts: {
          orderId: "3001",
          fulfillmentId: "gid://shopify/Fulfillment/444",
          status: "SUCCESS",
          fulfilledAt: "2026-09-12T08:00:00.000Z",
          lineItems: [{
            fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/501",
            lineItemId: "gid://shopify/LineItem/601",
            quantity: 2,
          }],
          tracking: { number: "1Z999", company: "UPS", url: null },
          notifyCustomerRequested: false,
        },
      },
    });
    expect(result.message).not.toContain("REQUESTED");
    expect(result.message).toContain("1Z999");
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

  // Whether Shopify was asked to email the customer decides whether the agent's
  // reply should be the first notice or a follow-up. It is not delivery proof.
  it("tells the agent it owns the notification when notify_customer is false", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse())
      .mockResolvedValueOnce(fulfillmentCreatedResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder({ ...input, notify_customer: false }, ctx);

    const request = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(request.variables.fulfillment.notifyCustomer).toBe(false);
    expect(result.message).toContain("was NOT asked to email the customer");
  });

  // A dropped connection after fulfillmentCreate went out can leave the order
  // fulfilled and the customer emailed. Reporting that as a flat failure invites
  // the retry that sends a second shipping notice.
  it("reports an interrupted fulfillment mutation as unknown, not failed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse())
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder(input, receiptCtx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("Do not fulfill again");
    expect(result.receipt).toMatchObject({
      tool: "fulfill_order",
      outcome: "unknown",
      code: "ambiguous_provider_response",
    });
  });

  it("keeps an incomplete post-mutation fulfillment response unknown", async () => {
    const response = fulfillmentCreatedResponse();
    const body = await response.json() as {
      data: {
        fulfillmentCreate: {
          fulfillment: { fulfillmentLineItems: { edges: unknown[] } };
        };
      };
    };
    body.data.fulfillmentCreate.fulfillment.fulfillmentLineItems = { edges: [] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fulfillmentOrdersResponse())
      .mockResolvedValueOnce(jsonResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillOrder(input, receiptCtx);

    expect(result.status).toBe("unknown");
    expect(result.receipt).toMatchObject({
      outcome: "unknown",
      code: "confirmed_state_incomplete",
      providerReference: "gid://shopify/Fulfillment/444",
    });
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

    const result = await fulfillOrder(input, receiptCtx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("Fulfillment orders are on hold");
    expect(result.receipt).toMatchObject({ outcome: "failed", code: "provider_rejected" });
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
