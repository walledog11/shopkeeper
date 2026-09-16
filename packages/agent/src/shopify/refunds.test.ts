import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse as sharedJsonResponse } from "../testing/json-response.js";
import { createRefund } from "./refunds.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
  operationId: "0ecfcf1c-2a07-4caf-956f-77cbaa2fb83a:refund_step",
};

// Stated on every call rather than defaulted: the per-call cap is enforced
// inside `createRefund` and nowhere else, so a test that omits it is testing an
// uncapped workspace whether or not it meant to.
const uncapped = { maxRefundAmount: null };

// Every stub here answers with retry-after: 0 so the client's backoff does not
// sleep the suite; otherwise this is the shared helper.
function jsonResponse(body: unknown, status = 200): Response {
  return sharedJsonResponse(body, { status, headers: { "retry-after": "0" } });
}

function orderResponse() {
  return jsonResponse({
    order: {
      id: 456,
      currency: "USD",
      financial_status: "paid",
      refunds: [],
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

// Every accepted call uses the full line-item and shipping path. The supplied
// amount is an assertion against Shopify's complete refundable balance.
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

    const result = await createRefund({ order_id: "456", amount: "25.50", currency: "USD" }, ctx, uncapped);
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
    expect(result).toMatchObject({ status: "ok", refundedShopCents: 2550 });
  });

  it("always asks for full shipping and all refundable line items", async () => {
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

  it("policy-blocks a custom amount before mutation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderResponse())
      .mockResolvedValueOnce(multiTransactionCalculationResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "20.00" }, ctx, uncapped);

    expect(result).toMatchObject({ status: "policy_block", refundedShopCents: null, data: { code: "amount_mismatch" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["partially_refunded", "order_not_paid"],
    ["refunded", "order_not_paid"],
    ["authorized", "order_not_paid"],
    ["voided", "order_not_paid"],
  ])("policy-blocks financial status %s before calculation", async (financialStatus, code) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      order: {
        id: 456,
        currency: "USD",
        financial_status: financialStatus,
        refunds: [],
        line_items: [{ id: 11, title: "Hat", quantity: 1, current_quantity: 1 }],
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "20.00" }, ctx, uncapped);

    expect(result).toMatchObject({ status: "policy_block", data: { code } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("policy-blocks an existing refund record before calculation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      order: {
        id: 456,
        currency: "USD",
        financial_status: "paid",
        refunds: [{ id: 1 }],
        line_items: [{ id: 11, title: "Hat", quantity: 1, current_quantity: 1 }],
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "20.00" }, ctx, uncapped);

    expect(result).toMatchObject({ status: "policy_block", data: { code: "prior_refund" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("policy-blocks a requested currency mismatch before pricing anything", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(orderResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "20.00", currency: "CAD" }, ctx, uncapped);

    expect(result).toMatchObject({ status: "policy_block", data: { code: "currency_mismatch" } });
    // The order fetch alone: a refused currency never reaches the calculation.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Live shape of order #1031, read off the store on 2026-09-11: a USD shop and
  // a Toronto customer charged 59.90 CAD. The refund settles in CAD, and the
  // probe confirmed Shopify's calculation answers CAD whether or not the request
  // names one. The agent must therefore ask for CAD; asking for the shop's USD
  // is the input error the block below exists to catch.
  const internationalOrder = {
    id: 456,
    currency: "USD",
    presentment_currency: "CAD",
    current_total_price_set: {
      shop_money: { amount: "43.48", currency_code: "USD" },
      presentment_money: { amount: "59.90", currency_code: "CAD" },
    },
    financial_status: "paid",
    refunds: [],
    line_items: [{ id: 11, title: "Hat", quantity: 1, current_quantity: 1 }],
  };

  it("prices and settles an international refund in the currency the customer was charged", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: internationalOrder }))
      .mockResolvedValueOnce(jsonResponse({
        refund: {
          currency: "CAD",
          transactions: [{
            kind: "suggested_refund",
            gateway: "shopify_payments",
            parent_id: 222,
            amount: "59.90",
            currency: "CAD",
            maximum_refundable: "59.90",
          }],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          refundCreate: {
            refund: {
              id: "gid://shopify/Refund/9001",
              totalRefundedSet: {
                presentmentMoney: { amount: "59.90" },
                shopMoney: { amount: "43.48" },
              },
              transactions: { nodes: [{ status: "SUCCESS" }] },
            },
            userErrors: [],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "59.90", currency: "CAD" }, ctx, uncapped);

    // The customer is told CAD; the compensation ledger counts the shop's USD.
    // Filing 5990 here would put the customer's currency in the merchant's
    // column, which is the whole defect.
    expect(result).toMatchObject({ status: "ok", refundedShopCents: 4348 });
    expect(result.message).toContain("59.90 CAD");
    // The calculation is asked in the customer's currency rather than left to a
    // default, which `refundCreate` requires whenever the two differ...
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).refund.currency).toBe("CAD");
    // ...and the mutation settles in it.
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string).variables.input.currency).toBe("CAD");
  });

  // `createRefund` is the only place a full refund's per-call cap is enforced:
  // the static pre-check runs before the order is loaded and cannot convert a
  // foreign amount, so it defers to here. These cover the three answers.
  describe("workspace refund cap", () => {
    it("policy-blocks a refund over the cap, in the merchant's own currency", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(orderResponse());
      vi.stubGlobal("fetch", fetchMock);

      const result = await createRefund(
        { order_id: "456", amount: "20.00", currency: "USD" },
        ctx,
        { maxRefundAmount: 10 },
      );

      expect(result).toMatchObject({
        status: "policy_block",
        data: { code: "amount_over_cap" },
        refundedShopCents: null,
      });
      // Blocked before the calculation, so nothing was priced at Shopify.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // 59.90 CAD is 43.48 in the shop's books, which is under a limit of 50. The
    // cap is a number the merchant typed in their own currency, so comparing it
    // to the customer's would refuse an ordinary international refund.
    it("judges an international refund against the shop's figure, not the customer's", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonResponse({ order: internationalOrder }))
        .mockResolvedValueOnce(jsonResponse({
          refund: {
            currency: "CAD",
            transactions: [{
              kind: "suggested_refund",
              gateway: "shopify_payments",
              parent_id: 222,
              amount: "59.90",
              currency: "CAD",
              maximum_refundable: "59.90",
            }],
          },
        }))
        .mockResolvedValueOnce(jsonResponse({
          data: {
            refundCreate: {
              refund: {
                id: "gid://shopify/Refund/9001",
                totalRefundedSet: {
                  presentmentMoney: { amount: "59.90" },
                  shopMoney: { amount: "43.48" },
                },
                transactions: { nodes: [{ status: "SUCCESS" }] },
              },
              userErrors: [],
            },
          },
        }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await createRefund(
        { order_id: "456", amount: "59.90", currency: "CAD" },
        ctx,
        { maxRefundAmount: 50 },
      );

      expect(result).toMatchObject({ status: "ok", refundedShopCents: 4348 });
    });

    // "Cannot tell" is a decision, not a fall-through. A capped workspace whose
    // order Shopify did not price in the shop's own currency goes to the
    // merchant; letting it through is how the cap stops existing.
    it("policy-blocks when the cap cannot be put in the shop's currency", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
        order: {
          id: 456,
          currency: "USD",
          presentment_currency: "CAD",
          financial_status: "paid",
          refunds: [],
          line_items: [{ id: 11, title: "Hat", quantity: 1, current_quantity: 1 }],
        },
      }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await createRefund(
        { order_id: "456", amount: "59.90", currency: "CAD" },
        ctx,
        { maxRefundAmount: 50 },
      );

      expect(result).toMatchObject({
        status: "policy_block",
        data: { code: "cap_not_comparable" },
        refundedShopCents: null,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  // The 2026-09-11 production failure, from the input side. The tool schema used
  // to ask for "the store's currency", so the agent sent USD for an order the
  // customer paid in CAD and the refund was refused. The guard is right; the
  // instruction that produced the input was not.
  it("policy-blocks a request naming the shop currency on an international order", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ order: internationalOrder }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "43.48", currency: "USD" }, ctx, uncapped);

    expect(result).toMatchObject({
      status: "policy_block",
      data: { code: "currency_mismatch", requestedCurrency: "USD", currency: "CAD" },
    });
    // Nothing was priced: the currency is decided before any money is asked for.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Shopify answering in a currency other than the one asked for would mean the
  // transactions no longer match the order, so it stops before the mutation.
  it("policy-blocks when Shopify prices the refund in another currency", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ order: internationalOrder }))
      .mockResolvedValueOnce(jsonResponse({
        refund: {
          currency: "USD",
          transactions: [{ kind: "suggested_refund", gateway: "manual", parent_id: 222, amount: "43.48", currency: "USD" }],
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "59.90", currency: "CAD" }, ctx, uncapped);

    expect(result).toMatchObject({ status: "policy_block", data: { code: "currency_mismatch", currency: "USD" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("policy-blocks when the order carries no currency at all", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        order: {
          id: 456,
          financial_status: "paid",
          refunds: [],
          line_items: [{ id: 11, title: "Hat", quantity: 1, current_quantity: 1 }],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ refund: { transactions: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "20.00" }, ctx, uncapped);

    expect(result).toMatchObject({ status: "policy_block", data: { code: "currency_missing" } });
    // The currency gates the calculation, so an order without one never prices.
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

    const result = await createRefund({ order_id: "456", amount: "20.00" }, ctx, uncapped);
    const firstAttempt = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    const retry = JSON.parse(fetchMock.mock.calls[3][1].body as string);

    expect(result).toMatchObject({ status: "ok", refundedShopCents: 2000 });
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

    const result = await createRefund({ order_id: "456", amount: "20.00" }, ctx, uncapped);
    const firstAttempt = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    const retry = JSON.parse(fetchMock.mock.calls[3][1].body as string);

    expect(result).toMatchObject({ status: "ok", refundedShopCents: 2000 });
    expect(firstAttempt.variables.idempotencyKey).toBe(retry.variables.idempotencyKey);
  });

  it("returns unknown after an idempotent retry still cannot confirm the mutation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderResponse())
      .mockResolvedValueOnce(calculationResponse())
      .mockResolvedValueOnce(jsonResponse({ errors: "unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse({ errors: "still unavailable" }, 503));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "20.00" }, ctx, uncapped);

    expect(result.status).toBe("unknown");
    expect(result.refundedShopCents).toBeNull();
    expect(result.message).toContain("may have committed at Shopify");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("returns unknown when Shopify creates the refund with a pending payment", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(orderResponse())
      .mockResolvedValueOnce(calculationResponse())
      .mockResolvedValueOnce(refundResponse("PENDING"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createRefund({ order_id: "456", amount: "20.00" }, ctx, uncapped);

    expect(result.status).toBe("unknown");
    expect(result.refundedShopCents).toBeNull();
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

    const result = await createRefund({ order_id: "456", amount: "20.00" }, ctx, uncapped);

    expect(result).toEqual({
      status: "error",
      message: "Error: failed to create refund - Amount is not refundable",
      refundedShopCents: null,
    });
  });
});
