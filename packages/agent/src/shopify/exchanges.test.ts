import { afterEach, describe, expect, it, vi } from "vitest";
import { createExchange } from "./exchanges.js";

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

const returnableResponse = () => jsonResponse({
  data: {
    order: {
      returnableFulfillments: {
        edges: [
          {
            node: {
              returnableFulfillmentLineItems: {
                edges: [
                  {
                    node: {
                      quantity: 1,
                      fulfillmentLineItem: {
                        id: "gid://shopify/FulfillmentLineItem/111",
                        lineItem: {
                          name: "Trail Boots - Size 10",
                          variant: { id: "gid://shopify/ProductVariant/710000004040" },
                        },
                      },
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

function pricesResponse(returnedPrice: string, replacementPrice: string): Response {
  return jsonResponse({
    data: {
      nodes: [
        {
          id: "gid://shopify/ProductVariant/710000004040",
          title: "Size 10",
          price: returnedPrice,
          product: { title: "Trail Boots" },
        },
        {
          id: "gid://shopify/ProductVariant/710000004041",
          title: "Size 11",
          price: replacementPrice,
          product: { title: "Trail Boots" },
        },
      ],
    },
  });
}

const input = {
  order_id: "9000004040",
  variant_id: "710000004040",
  exchange_variant_id: "710000004041",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createExchange", () => {
  it("rejects exchanging a variant for itself without calling Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await createExchange({ ...input, exchange_variant_id: input.variant_id }, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("same as the item being returned");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks the exchange when the replacement costs more", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(returnableResponse())
      .mockResolvedValueOnce(pricesResponse("120.00", "180.00"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createExchange(input, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("costs more");
    expect(result.message).toContain("Escalate to the merchant");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a quantity above what is returnable", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(returnableResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await createExchange({ ...input, quantity: 3 }, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("only 1 unit(s)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates the return with exchange line items on the happy path", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(returnableResponse())
      .mockResolvedValueOnce(pricesResponse("120.00", "120.00"))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          returnCreate: {
            return: { id: "gid://shopify/Return/999", name: "#4040-R1", status: "REQUESTED" },
            userErrors: [],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createExchange(input, ctx);

    const returnCreateRequest = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(returnCreateRequest.variables.returnInput).toEqual({
      orderId: "gid://shopify/Order/9000004040",
      returnLineItems: [
        {
          fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/111",
          quantity: 1,
          returnReason: "UNKNOWN",
        },
      ],
      exchangeLineItems: [
        { variantId: "gid://shopify/ProductVariant/710000004041", quantity: 1 },
      ],
    });
    expect(result.status).toBe("ok");
    expect(result.message).toContain("#4040-R1");
    expect(result.message).toContain("Trail Boots - Size 11");
    expect(result.message).toContain("No refund was issued");
  });
});
