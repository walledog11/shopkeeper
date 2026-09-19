import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { createPartialRefund, parseRefundItems, unrefundableItems } from "./partial-refunds.js";
import { resolveAgentSettings } from "../settings.js";
import { toolPolicyBlock, toolUnknown, type CompensationReservation } from "../tools/result.js";
import type { ShopifyContext } from "./client.js";

// The executor supplies `reserveCompensation`, because the amount this tool
// spends only exists once Shopify has priced the selection.
const reserveCompensation = vi.fn(async (): Promise<CompensationReservation> => ({ kind: "reserved" }));

const ctx: ShopifyContext = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
  operationId: "execution-1:partial-refund",
  executionId: "execution-1",
  reserveCompensation,
};
const SETTINGS = resolveAgentSettings(null);

function order(overrides: Record<string, unknown> = {}) {
  return {
    order: {
      id: 2001,
      name: "#1024",
      currency: "USD",
      financial_status: "paid",
      refunds: [],
      line_items: [
        { id: 9001, title: "Napkin", quantity: 3, current_quantity: 3 },
        { id: 9002, title: "Runner", quantity: 1, current_quantity: 1 },
      ],
      ...overrides,
    },
  };
}

function calculation(amount: string) {
  return {
    refund: {
      currency: "USD",
      transactions: [{ amount, gateway: "shopify_payments", parent_id: 77, kind: "suggested_refund" }],
    },
  };
}

function committed(amount: string) {
  return {
    data: {
      refundCreate: {
        refund: {
          id: "gid://shopify/Refund/1",
          totalRefundedSet: { presentmentMoney: { amount } },
          transactions: { nodes: [{ id: "gid://shopify/OrderTransaction/2", status: "SUCCESS" }] },
        },
        userErrors: [],
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  reserveCompensation.mockReset().mockResolvedValue({ kind: "reserved" });
});

describe("parseRefundItems", () => {
  it("reads line items and quantities", () => {
    expect(parseRefundItems([{ line_item_id: "9001", quantity: 2 }]))
      .toEqual([{ lineItemId: "9001", quantity: 2 }]);
  });

  it("refuses a fractional or zero quantity", () => {
    expect(() => parseRefundItems([{ line_item_id: "9001", quantity: 1.5 }])).toThrow();
    expect(() => parseRefundItems([{ line_item_id: "9001", quantity: 0 }])).toThrow();
  });

  it("refuses the same line item twice", () => {
    expect(() => parseRefundItems([
      { line_item_id: "9001", quantity: 1 },
      { line_item_id: "9001", quantity: 1 },
    ])).toThrow(/more than once/);
  });

  it("refuses an empty selection", () => {
    expect(() => parseRefundItems([])).toThrow();
  });
});

describe("unrefundableItems", () => {
  it("accepts a quantity within what is left", () => {
    expect(unrefundableItems(order().order, [{ lineItemId: "9001", quantity: 3 }])).toEqual([]);
  });

  it("reports every mismatch at once", () => {
    const problems = unrefundableItems(order().order, [
      { lineItemId: "9001", quantity: 4 },
      { lineItemId: "9999", quantity: 1 },
    ]);

    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("has 3 refundable, not 4");
    expect(problems[1]).toContain("not on this order");
  });

  // A partly-refunded line reports its remaining quantity, not its original.
  it("uses the current quantity rather than the ordered one", () => {
    const partly = order({
      line_items: [{ id: 9001, title: "Napkin", quantity: 3, current_quantity: 1 }],
    }).order;

    expect(unrefundableItems(partly, [{ lineItemId: "9001", quantity: 2 }])[0])
      .toContain("has 1 refundable");
  });
});

describe("createPartialRefund", () => {
  it("refunds what Shopify calculated for the chosen items", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(order()))
      .mockResolvedValueOnce(jsonResponse(calculation("16.00")))
      .mockResolvedValueOnce(jsonResponse(committed("16.00")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPartialRefund(
      { order_id: "2001", items: [{ line_item_id: "9001", quantity: 1 }] },
      ctx,
      SETTINGS,
    );

    expect(result.status).toBe("ok");
    expect(result.refundedCents).toBe(1_600);
    expect(result.receipt).toMatchObject({
      tool: "create_partial_refund",
      outcome: "succeeded",
      facts: {
        amount: "16.00",
        currency: "USD",
        lineItems: [{ lineItemId: "9001", quantity: 1 }],
      },
    });
    // Shipping is never part of a partial refund.
    const calcBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(calcBody.refund.shipping).toEqual({ full_refund: false });
  });

  // The model never names an amount, so it cannot understate one to duck a cap.
  // The cap is applied to Shopify's figure instead.
  it("blocks when Shopify's calculated amount exceeds the per-call cap", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(order()))
      .mockResolvedValueOnce(jsonResponse(calculation("120.00")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPartialRefund(
      { order_id: "2001", items: [{ line_item_id: "9001", quantity: 3 }] },
      ctx,
      resolveAgentSettings({ maxRefundAmount: 50 }),
    );

    expect(result.status).toBe("policy_block");
    expect(result.message).toContain("over the workspace limit of $50");
    expect(result.refundedCents).toBeNull();
    expect(result.receipt).toMatchObject({
      tool: "create_partial_refund",
      outcome: "rejected",
      code: "amount_over_cap",
      target: { kind: "order", id: "2001" },
    });
    // Two reads happened; the refund did not.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reserves Shopify's figure against the daily budget before it commits", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(order()))
      .mockResolvedValueOnce(jsonResponse(calculation("16.00")))
      .mockResolvedValueOnce(jsonResponse(committed("16.00")));
    vi.stubGlobal("fetch", fetchMock);
    let providerCallsWhenReserved = -1;
    reserveCompensation.mockImplementation(async () => {
      providerCallsWhenReserved = fetchMock.mock.calls.length;
      return { kind: "reserved" };
    });

    const result = await createPartialRefund(
      { order_id: "2001", items: [{ line_item_id: "9001", quantity: 1 }] },
      ctx,
      SETTINGS,
    );

    expect(result.status).toBe("ok");
    // The amount reserved is the one Shopify priced, and it was reserved after
    // the read and the calculation but before the mutation.
    expect(reserveCompensation).toHaveBeenCalledWith(1_600);
    expect(providerCallsWhenReserved).toBe(2);
  });

  it("leaves the order untouched when the daily budget refuses it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(order()))
      .mockResolvedValueOnce(jsonResponse(calculation("16.00")));
    vi.stubGlobal("fetch", fetchMock);
    reserveCompensation.mockResolvedValue({
      kind: "refused",
      result: toolPolicyBlock("Error: refund policy blocked - daily compensation cap of $20 reached."),
      policyBlocked: true,
    });

    const result = await createPartialRefund(
      { order_id: "2001", items: [{ line_item_id: "9001", quantity: 1 }] },
      ctx,
      SETTINGS,
    );

    expect(result.status).toBe("policy_block");
    expect(result.refundedCents).toBeNull();
    expect(result.receipt).toMatchObject({
      outcome: "rejected",
      code: "compensation_budget_refused",
    });
    // Two reads happened; the refund did not.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps an unknown budget record unknown rather than calling it a failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(order()))
      .mockResolvedValueOnce(jsonResponse(calculation("16.00")));
    vi.stubGlobal("fetch", fetchMock);
    reserveCompensation.mockResolvedValue({
      kind: "refused",
      result: toolUnknown("Unknown: this compensation action already has a submitted budget record."),
      policyBlocked: false,
    });

    const result = await createPartialRefund(
      { order_id: "2001", items: [{ line_item_id: "9001", quantity: 1 }] },
      ctx,
      SETTINGS,
    );

    // This attempt refunded nothing, but an earlier one under the same operation
    // may have, so it must not be reported as a definite failure.
    expect(result.status).toBe("unknown");
    expect(result.refundedCents).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses the refund when no budget check was supplied", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(order()))
      .mockResolvedValueOnce(jsonResponse(calculation("16.00")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPartialRefund(
      { order_id: "2001", items: [{ line_item_id: "9001", quantity: 1 }] },
      { ...ctx, reserveCompensation: undefined },
      SETTINGS,
    );

    // Fails closed: an unchecked daily budget is not a reason to refund anyway.
    expect(result.status).toBe("policy_block");
    expect(result.receipt).toMatchObject({ code: "compensation_budget_unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses an order that is not fully paid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(
      jsonResponse(order({ financial_status: "partially_refunded" })),
    ));

    const result = await createPartialRefund(
      { order_id: "2001", items: [{ line_item_id: "9001", quantity: 1 }] },
      ctx,
      SETTINGS,
    );

    expect(result.status).toBe("policy_block");
    expect(result.message).toContain("financial status");
  });

  // Stacking refunds is what would make the reconciliation probe ambiguous.
  it("refuses an order that already has a refund", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(
      jsonResponse(order({ refunds: [{ id: 1 }] })),
    ));

    const result = await createPartialRefund(
      { order_id: "2001", items: [{ line_item_id: "9001", quantity: 1 }] },
      ctx,
      SETTINGS,
    );

    expect(result.status).toBe("policy_block");
    expect(result.message).toContain("already has a refund");
  });

  it("refuses a quantity the order cannot cover", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(order()));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPartialRefund(
      { order_id: "2001", items: [{ line_item_id: "9001", quantity: 9 }] },
      ctx,
      SETTINGS,
    );

    expect(result.status).toBe("policy_block");
    expect(result.message).toContain("has 3 refundable, not 9");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses when Shopify calculates nothing to refund", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(order()))
      .mockResolvedValueOnce(jsonResponse({ refund: { currency: "USD", transactions: [] } })));

    const result = await createPartialRefund(
      { order_id: "2001", items: [{ line_item_id: "9001", quantity: 1 }] },
      ctx,
      SETTINGS,
    );

    expect(result.status).toBe("policy_block");
    expect(result.refundedCents).toBeNull();
  });

  // A committed refund whose transaction is not SUCCESS is unknown, never ok:
  // the customer must not be told money is on its way.
  it("reports an unsettled transaction as unknown", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse(order()))
      .mockResolvedValueOnce(jsonResponse(calculation("16.00")))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          refundCreate: {
            refund: {
              id: "gid://shopify/Refund/1",
              totalRefundedSet: { presentmentMoney: { amount: "16.00" } },
              transactions: { nodes: [{ id: "gid://shopify/OrderTransaction/2", status: "PENDING" }] },
            },
            userErrors: [],
          },
        },
      })));

    const result = await createPartialRefund(
      { order_id: "2001", items: [{ line_item_id: "9001", quantity: 1 }] },
      ctx,
      SETTINGS,
    );

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("Do not retry");
    expect(result.refundedCents).toBeNull();
  });

  it("sends an idempotency key with the mutation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(order()))
      .mockResolvedValueOnce(jsonResponse(calculation("16.00")))
      .mockResolvedValueOnce(jsonResponse(committed("16.00")));
    vi.stubGlobal("fetch", fetchMock);

    await createPartialRefund(
      { order_id: "2001", items: [{ line_item_id: "9001", quantity: 1 }] },
      { ...ctx, operationId: "execution:abc" },
      SETTINGS,
    );

    const body = JSON.parse(String(fetchMock.mock.calls[2][1].body));
    expect(body.variables.idempotencyKey).toBeTruthy();
  });
});
