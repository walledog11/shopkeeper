import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { createReturn } from "./returns.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
  operationId: "operation-return-1",
  executionId: "execution-return-1",
};

function returnableFulfillmentsResponse(): Response {
  return jsonResponse({
    data: {
      order: { id: "gid://shopify/Order/2001" },
      returnableFulfillments: {
        edges: [{
          node: {
            returnableFulfillmentLineItems: {
              edges: [{
                node: {
                  quantity: 1,
                  fulfillmentLineItem: {
                    id: "gid://shopify/FulfillmentLineItem/321",
                    lineItem: {
                      name: "Wool Scarf",
                      variant: { id: "gid://shopify/ProductVariant/111" },
                    },
                  },
                },
              }],
            },
          },
        }],
      },
    },
  });
}

const input = { order_id: "2001", reason: "unwanted" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createReturn", () => {
  it("opens a return on the happy path", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(returnableFulfillmentsResponse())
      .mockResolvedValueOnce(jsonResponse({
        data: {
          returnCreate: {
            return: { id: "gid://shopify/Return/999", name: "#2001-R1", status: "REQUESTED" },
            userErrors: [],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createReturn(input, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("#2001-R1");
    expect(result.receipt).toMatchObject({
      version: 1,
      operationId: ctx.operationId,
      executionId: ctx.executionId,
      tool: "create_return",
      target: { kind: "order", id: "2001" },
      outcome: "succeeded",
      providerReference: "gid://shopify/Return/999",
      facts: {
        orderId: "2001",
        returnId: "gid://shopify/Return/999",
        returnName: "#2001-R1",
        status: "REQUESTED",
        lineItems: [{
          fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/321",
          quantity: 1,
        }],
        refundIssued: false,
      },
    });
  });

  // A return that opened at Shopify and then lost the connection must not read
  // as a failure: the retry it invites opens a second return on the order.
  it("reports an interrupted returnCreate as unknown, not failed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(returnableFulfillmentsResponse())
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createReturn(input, ctx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("Do not open another return");
    expect(result.receipt).toMatchObject({
      tool: "create_return",
      outcome: "unknown",
      code: "ambiguous_provider_response",
    });
  });

  // The returnable-items lookup precedes the mutation, so its failure committed
  // nothing.
  it("keeps a failed returnable-items lookup an error", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createReturn(input, ctx);

    expect(result.status).toBe("error");
    expect(result.receipt).toMatchObject({
      tool: "create_return",
      outcome: "failed",
      code: "definite_failure",
    });
  });

  it("keeps a rejected document an error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(returnableFulfillmentsResponse())
      .mockResolvedValueOnce(jsonResponse({
        errors: [{ message: "Field 'code' doesn't exist on type 'UserError'" }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createReturn(input, ctx);

    expect(result.status).toBe("error");
    expect(result.receipt).toMatchObject({
      tool: "create_return",
      outcome: "failed",
      code: "definite_failure",
    });
  });

  it("keeps a provider rejection distinct from an uncertain commit", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(returnableFulfillmentsResponse())
      .mockResolvedValueOnce(jsonResponse({
        data: {
          returnCreate: {
            return: null,
            userErrors: [{ field: ["returnInput"], message: "Return is not allowed" }],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createReturn(input, ctx);

    expect(result).toMatchObject({
      status: "error",
      receipt: {
        tool: "create_return",
        outcome: "failed",
        code: "provider_rejected",
      },
    });
  });

  it("preserves an incomplete successful provider response as unknown", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(returnableFulfillmentsResponse())
      .mockResolvedValueOnce(jsonResponse({
        data: {
          returnCreate: {
            return: { id: "gid://shopify/Return/999", name: null, status: "REQUESTED" },
            userErrors: [],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createReturn(input, ctx);

    expect(result).toMatchObject({
      status: "unknown",
      receipt: {
        tool: "create_return",
        outcome: "unknown",
        code: "confirmed_state_incomplete",
        providerReference: "gid://shopify/Return/999",
      },
    });
  });
});
