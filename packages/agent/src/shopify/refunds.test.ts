import { afterEach, describe, expect, it, vi } from "vitest";
import { createRefund } from "./refunds.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
  operationId: "0ecfcf1c-2a07-4caf-956f-77cbaa2fb83a:refund_step",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "retry-after": "0" },
  });
}

function orderResponse() {
  return jsonResponse({
    order: {
      id: 456,
      currency: "USD",
      line_items: [{ id: 11, title: "Hat", quantity: 1, current_quantity: 1 }],
    },
  });
}

function calculationResponse() {
  return jsonResponse({
    refund: {
      currency: "USD",
      transactions: [{
        kind: "suggested_refund",
        gateway: "shopify_payments",
        parent_id: 222,
        amount: "20.00",
        maximum_refundable: "50.00",
      }],
    },
  });
}

function refundResponse(status = "SUCCESS") {
  return jsonResponse({
    data: {
      refundCreate: {
        refund: {
          id: "gid://shopify/Refund/9001",
          totalRefundedSet: { presentmentMoney: { amount: "20.00" } },
          transactions: { nodes: [{ status }] },
        },
        userErrors: [],
      },
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createRefund provider outcomes", () => {
  it.each([429, 503])("retries a %s provider response with the same idempotency key", async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderResponse())
      .mockResolvedValueOnce(calculationResponse())
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost after commit" }, status))
      .mockResolvedValueOnce(refundResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "20.00" }, ctx);
    const firstAttempt = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    const retry = JSON.parse(fetchMock.mock.calls[3][1].body as string);

    expect(result).toMatchObject({ status: "ok", refundedCents: 2000 });
    expect(firstAttempt.variables).toEqual(retry.variables);
    expect(firstAttempt.variables.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("replays safely when the connection closes after Shopify may have committed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderResponse())
      .mockResolvedValueOnce(calculationResponse())
      .mockRejectedValueOnce(new TypeError("socket closed after request write"))
      // Shopify returns the cached result for the repeated idempotency key.
      .mockResolvedValueOnce(refundResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "20.00" }, ctx);
    const firstAttempt = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    const retry = JSON.parse(fetchMock.mock.calls[3][1].body as string);

    expect(result).toMatchObject({ status: "ok", refundedCents: 2000 });
    expect(firstAttempt.variables.idempotencyKey).toBe(retry.variables.idempotencyKey);
  });

  it("returns unknown after an idempotent retry still cannot confirm the mutation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderResponse())
      .mockResolvedValueOnce(calculationResponse())
      .mockResolvedValueOnce(jsonResponse({ errors: "unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse({ errors: "still unavailable" }, 503));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "20.00" }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.refundedCents).toBeNull();
    expect(result.message).toContain("may have committed at Shopify");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("returns unknown when Shopify creates the refund with a pending payment", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderResponse())
      .mockResolvedValueOnce(calculationResponse())
      .mockResolvedValueOnce(refundResponse("PENDING"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "20.00" }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.refundedCents).toBeNull();
    expect(result.message).toContain("payment status is PENDING");
  });

  it("keeps GraphQL user errors as known failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderResponse())
      .mockResolvedValueOnce(calculationResponse())
      .mockResolvedValueOnce(jsonResponse({
        data: {
          refundCreate: {
            refund: null,
            userErrors: [{ field: ["input", "transactions"], message: "Amount is not refundable" }],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "20.00" }, ctx);

    expect(result).toEqual({
      status: "error",
      message: "Error: failed to create refund - Amount is not refundable",
      refundedCents: null,
    });
  });
});
