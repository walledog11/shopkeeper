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

// A full refund fans out across every transaction that paid for the order, and
// Shopify's calculation is the source of truth for both the transactions and
// the line items - including a $0 one, which it returns and which must not be
// sent.
function multiTransactionCalculationResponse() {
  return jsonResponse({
    refund: {
      currency: "USD",
      refund_line_items: [
        { line_item_id: 11, quantity: 1, restock_type: "return", location_id: 77 },
        { line_item_id: 12, quantity: 2, restock_type: "no_restock", location_id: 77 },
      ],
      transactions: [
        {
          kind: "suggested_refund",
          gateway: "shopify_payments",
          parent_id: 222,
          amount: "20.00",
          maximum_refundable: "20.00",
        },
        { kind: "suggested_refund", gateway: "gift_card", parent_id: 223, amount: "0.00", maximum_refundable: "0.00" },
        { kind: "suggested_refund", gateway: "paypal", parent_id: 224, amount: "5.50", maximum_refundable: "5.50" },
      ],
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The branch that had never executed against a real store: omitting `amount`
// takes buildFullRefundTransactions and graphqlRefundLineItems instead of the
// partial path. These assert the document variables, which is the half a live
// canary run cannot isolate.
describe("createRefund full-refund input", () => {
  async function fullRefundVariables() {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderResponse())
      .mockResolvedValueOnce(multiTransactionCalculationResponse())
      .mockResolvedValueOnce(jsonResponse({
        data: {
          refundCreate: {
            refund: {
              id: "gid://shopify/Refund/9001",
              totalRefundedSet: { presentmentMoney: { amount: "25.50" } },
              transactions: { nodes: [{ status: "SUCCESS" }] },
            },
            userErrors: [],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456" }, ctx);
    return { result, variables: JSON.parse(fetchMock.mock.calls[2][1].body as string).variables };
  }

  it("refunds every paying transaction at its full amount and drops the zero one", async () => {
    const { result, variables } = await fullRefundVariables();

    expect(variables.input.transactions).toEqual([
      {
        orderId: "gid://shopify/Order/456",
        kind: "REFUND",
        gateway: "shopify_payments",
        amount: "20.00",
        parentId: "gid://shopify/OrderTransaction/222",
      },
      {
        orderId: "gid://shopify/Order/456",
        kind: "REFUND",
        gateway: "paypal",
        amount: "5.50",
        parentId: "gid://shopify/OrderTransaction/224",
      },
    ]);
    expect(result).toMatchObject({ status: "ok", refundedCents: 2550 });
  });

  it("asks for the shipping and line items the partial path leaves out", async () => {
    const { variables } = await fullRefundVariables();

    expect(variables.input.shipping).toEqual({ fullRefund: true });
    // Shopify's calculated line items win over the ones derived from the order.
    expect(variables.input.refundLineItems).toEqual([
      {
        lineItemId: "gid://shopify/LineItem/11",
        quantity: 1,
        restockType: "RETURN",
        locationId: "gid://shopify/Location/77",
      },
      { lineItemId: "gid://shopify/LineItem/12", quantity: 2, restockType: "NO_RESTOCK" },
    ]);
  });

  it("sends neither of them when an amount is given", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderResponse())
      .mockResolvedValueOnce(multiTransactionCalculationResponse())
      .mockResolvedValueOnce(refundResponse());
    vi.stubGlobal("fetch", fetchMock);

    await createRefund({ order_id: "456", amount: "20.00" }, ctx);
    const { input } = JSON.parse(fetchMock.mock.calls[2][1].body as string).variables;

    expect(input.shipping).toBeUndefined();
    expect(input.refundLineItems).toBeUndefined();
    expect(input.transactions).toHaveLength(1);
  });
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
