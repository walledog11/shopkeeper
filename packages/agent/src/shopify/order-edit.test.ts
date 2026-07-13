import { afterEach, describe, expect, it, vi } from "vitest";
import { editShopifyOrder } from "./order-edit.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
  operationId: "execution-1:edit-order",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function beginResponse() {
  return jsonResponse({
    data: {
      orderEditBegin: {
        calculatedOrder: {
          id: "gid://shopify/CalculatedOrder/1",
          lineItems: {
            edges: [{
              node: {
                id: "gid://shopify/CalculatedLineItem/1",
                quantity: 1,
                title: "Old shirt",
                variant: { id: "gid://shopify/ProductVariant/123", title: "Red" },
              },
            }],
            pageInfo: { hasNextPage: false },
          },
        },
        userErrors: [],
      },
    },
  });
}

function stagedResponse(field: "orderEditAddVariant" | "orderEditSetQuantity") {
  return jsonResponse({
    data: {
      [field]: {
        calculatedOrder: { id: "gid://shopify/CalculatedOrder/1" },
        userErrors: [],
      },
    },
  });
}

function reconciledOrder(oldItemQuantity: number) {
  return jsonResponse({
    order: {
      id: 456,
      name: "#1001",
      line_items: [
        {
          id: 11,
          title: "Old shirt",
          variant_title: "Red",
          variant_id: 123,
          quantity: 1,
          current_quantity: oldItemQuantity,
        },
        {
          id: 22,
          title: "Sticker",
          variant_title: "Default Title",
          variant_id: 999,
          quantity: 1,
          current_quantity: 1,
        },
      ],
    },
  });
}

function graphqlOperation(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): string {
  const body = JSON.parse(fetchMock.mock.calls[callIndex]?.[1]?.body as string);
  return body.query;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("editShopifyOrder mutation safety", () => {
  it("does not call Shopify when the same variant would be added and removed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await editShopifyOrder({
      order_id: "456",
      variant_id: "123",
      remove_variant_id: "123",
    }, ctx);

    expect(result).toEqual({
      status: "error",
      message: "Error: edit_shopify_order cannot add and remove the same variant in one edit.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns unknown without replaying an interrupted edit-session creation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503));
    vi.stubGlobal("fetch", fetchMock);

    const result = await editShopifyOrder({ order_id: "456", variant_id: "789" }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("edit-session creation");
    expect(result.message).toContain("no order change was committed by this tool");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([429, 503])("returns unknown without replaying interrupted add staging after HTTP %i", async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(beginResponse())
      .mockResolvedValueOnce(jsonResponse({ errors: "ambiguous provider response" }, status));
    vi.stubGlobal("fetch", fetchMock);

    const result = await editShopifyOrder({ order_id: "456", variant_id: "789", quantity: 2 }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("add staging");
    expect(result.message).toContain("partial staged edit");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(graphqlOperation(fetchMock, 1)).toContain("mutation orderEditAddVariant");
  });

  it("reports a partial staged swap as unknown when removal is rejected", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(beginResponse())
      .mockResolvedValueOnce(stagedResponse("orderEditAddVariant"))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          orderEditSetQuantity: {
            calculatedOrder: null,
            userErrors: [{ field: ["lineItemId"], message: "The line item can no longer be edited." }],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await editShopifyOrder({
      order_id: "456",
      variant_id: "789",
      remove_variant_id: "123",
      quantity: 2,
    }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("staged the added item");
    expect(result.message).toContain("not committed by this tool");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([429, 503])("confirms a committed removal after an interrupted commit response with HTTP %i", async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(beginResponse())
      .mockResolvedValueOnce(stagedResponse("orderEditSetQuantity"))
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, status))
      .mockResolvedValueOnce(reconciledOrder(0));
    vi.stubGlobal("fetch", fetchMock);

    const result = await editShopifyOrder({ order_id: "456", remove_variant_id: "123" }, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("confirmed after an interrupted provider response");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(graphqlOperation(fetchMock, 2)).toContain("mutation orderEditCommit");
    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit).method === "POST")).toHaveLength(3);
  });

  it("reconciles a connection loss after Shopify commits the edit", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(beginResponse())
      .mockResolvedValueOnce(stagedResponse("orderEditSetQuantity"))
      .mockRejectedValueOnce(new TypeError("socket closed after request write"))
      .mockResolvedValueOnce(reconciledOrder(0));
    vi.stubGlobal("fetch", fetchMock);

    const result = await editShopifyOrder({ order_id: "456", remove_variant_id: "123" }, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("confirmed after an interrupted provider response");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("returns unknown when an interrupted commit cannot be confirmed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(beginResponse())
      .mockResolvedValueOnce(stagedResponse("orderEditSetQuantity"))
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(reconciledOrder(1));
    vi.stubGlobal("fetch", fetchMock);

    const result = await editShopifyOrder({ order_id: "456", remove_variant_id: "123" }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("follow-up read did not confirm");
    expect(result.message).toContain("Do not retry or confirm it to the customer");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
