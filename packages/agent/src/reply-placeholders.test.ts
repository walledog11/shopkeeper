import { describe, expect, it } from "vitest";
import type { ActionEntry } from "./agent-context.js";
import {
  bindReplyPlaceholders,
  customerMoney,
  displayApprovedDraft,
  fillApprovedDraft,
  isResultBinding,
  replyPlaceholderInstructions,
} from "./reply-placeholders.js";
import type { RawToolCall } from "./types.js";

const refundCall: RawToolCall = {
  id: "refund_1",
  name: "create_refund",
  input: { order_id: "123", reason: "Wrong size" },
};

const refundBinding = {
  placeholder: "refund_amount" as const,
  toolCallId: "refund_1",
  tool: "create_refund",
  field: "facts.amount",
};

function refundReceipt(amount = "42.00", currency = "USD") {
  return {
    version: 1 as const,
    operationId: "operation-1",
    executionId: "execution-1",
    tool: "create_refund" as const,
    target: { kind: "order", id: "123" },
    observedAt: "2026-09-25T07:00:00.000Z",
    outcome: "succeeded" as const,
    providerReference: "refund-1",
    facts: {
      orderId: "123",
      refundId: "refund-1",
      amount,
      currency,
      transactionStatus: "SUCCESS",
      transactionReference: "transaction-1",
      classification: "full" as const,
    },
  };
}

function refundAction(overrides: Partial<ActionEntry> = {}): ActionEntry {
  return {
    tool: "create_refund",
    toolCallId: "refund_1",
    input: refundCall.input,
    result: "Refund of $42.00 issued for order 123.",
    status: "success",
    receipt: refundReceipt(),
    ...overrides,
  };
}

describe("bindReplyPlaceholders", () => {
  it("binds a placeholder to the one approved call that can fill it", () => {
    expect(bindReplyPlaceholders("We refunded {{refund_amount}} today.", [refundCall]))
      .toEqual({ bindings: [refundBinding], unbound: [] });
  });

  it("binds a repeated placeholder once", () => {
    expect(bindReplyPlaceholders("{{refund_amount}}, yes, {{ refund_amount }}.", [refundCall]).bindings)
      .toEqual([refundBinding]);
  });

  it("leaves unbound an unknown name, a name with no filling call, and one with two", () => {
    const second = { ...refundCall, id: "refund_2" };
    expect(bindReplyPlaceholders("{{refund_total}}", [refundCall]).unbound).toEqual(["refund_total"]);
    expect(bindReplyPlaceholders("{{return_name}}", [refundCall]).unbound).toEqual(["return_name"]);
    expect(bindReplyPlaceholders("{{refund_amount}}", [refundCall, second]).unbound).toEqual(["refund_amount"]);
  });

  it("binds nothing in a draft without placeholders", () => {
    expect(bindReplyPlaceholders("Your refund is on its way.", [refundCall]))
      .toEqual({ bindings: [], unbound: [] });
  });
});

describe("isResultBinding", () => {
  it("accepts only a known placeholder read from a field its tool records", () => {
    expect(isResultBinding(refundBinding)).toBe(true);
    expect(isResultBinding({ ...refundBinding, field: "facts.refundId" })).toBe(false);
    expect(isResultBinding({ ...refundBinding, tool: "cancel_order" })).toBe(false);
    expect(isResultBinding({ ...refundBinding, extra: true })).toBe(false);
  });
});

describe("displayApprovedDraft", () => {
  it("shows each placeholder by what it will hold and leaves other text alone", () => {
    expect(displayApprovedDraft("We refunded {{refund_amount}} ({{unknown}})."))
      .toBe("We refunded [refund amount] ({{unknown}}).");
  });
});

describe("fillApprovedDraft", () => {
  it("fills a placeholder from the bound call's successful receipt and changes nothing else", () => {
    expect(fillApprovedDraft("Hi Jane, we refunded {{refund_amount}}.", [refundBinding], [refundAction()]))
      .toEqual({ status: "filled", text: "Hi Jane, we refunded $42.00." });
  });

  it("uses the receipt amount, not the requested one or the result text", () => {
    const action = refundAction({
      input: { order_id: "123", amount: "50.00" },
      result: "Refund of $50.00 issued.",
      receipt: refundReceipt("41.50"),
    });
    expect(fillApprovedDraft("{{refund_amount}}", [refundBinding], [action]))
      .toEqual({ status: "filled", text: "$41.50" });
  });

  // D18: a string-only action row never supplies a value for a new binding.
  it("does not parse a value out of a result string with no receipt", () => {
    expect(fillApprovedDraft("{{refund_amount}}", [refundBinding], [refundAction({ receipt: undefined })]))
      .toEqual({ status: "unfilled", placeholder: "refund_amount" });
  });

  it("does not fill from an action that did not succeed", () => {
    expect(fillApprovedDraft("{{refund_amount}}", [refundBinding], [refundAction({ status: "error" })]))
      .toEqual({ status: "unfilled", placeholder: "refund_amount" });
    expect(fillApprovedDraft("{{refund_amount}}", [refundBinding], []))
      .toEqual({ status: "unfilled", placeholder: "refund_amount" });
  });

  it("does not fill from a receipt field the provider left empty", () => {
    const fulfillment = {
      tool: "fulfill_order",
      toolCallId: "fulfill_1",
      result: "Fulfilled.",
      status: "success" as const,
      receipt: {
        version: 1 as const,
        operationId: "operation-2",
        executionId: "execution-1",
        tool: "fulfill_order" as const,
        target: { kind: "order", id: "123" },
        observedAt: "2026-09-25T07:00:00.000Z",
        outcome: "succeeded" as const,
        providerReference: "fulfillment-1",
        facts: {
          orderId: "123",
          fulfillmentId: "fulfillment-1",
          status: "SUCCESS",
          fulfilledAt: "2026-09-25T07:00:00.000Z",
          lineItems: [],
          tracking: { number: null, company: null, url: null },
          notifyCustomerRequested: false,
        },
      },
    };
    const binding = {
      placeholder: "tracking_number" as const,
      toolCallId: "fulfill_1",
      tool: "fulfill_order",
      field: "facts.tracking.number",
    };
    expect(fillApprovedDraft("Tracking: {{tracking_number}}", [binding], [fulfillment]))
      .toEqual({ status: "unfilled", placeholder: "tracking_number" });
  });

  it("refuses a draft that names a placeholder the approval never bound", () => {
    expect(fillApprovedDraft("{{refund_amount}}", [], [refundAction()]))
      .toEqual({ status: "unfilled", placeholder: "refund_amount" });
  });
});

describe("customerMoney", () => {
  it("keeps the provider's precision rather than assuming two decimals", () => {
    expect(customerMoney("42.00", "usd")).toBe("$42.00");
    expect(customerMoney("4200", "JPY")).toBe("4200 JPY");
  });
});

describe("replyPlaceholderInstructions", () => {
  it("offers exactly the placeholders the executor can fill", () => {
    const text = replyPlaceholderInstructions();
    for (const name of ["refund_amount", "return_name", "order_name", "gift_card_amount", "tracking_number"]) {
      expect(text).toContain(`{{${name}}}`);
    }
    expect(text).toContain("create_refund or create_partial_refund");
  });
});
