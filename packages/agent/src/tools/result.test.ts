import { describe, expect, it } from "vitest";
import {
  parseReceiptV1,
  receiptAsUnknown,
  ReceiptValidationError,
  validateToolResultReceipt,
  type ReceiptV1,
} from "./result.js";

function refundReceipt(overrides: Partial<ReceiptV1> = {}): ReceiptV1 {
  return {
    version: 1,
    operationId: "operation-1",
    executionId: "execution-1",
    tool: "create_refund",
    target: { kind: "order", id: "gid://shopify/Order/1" },
    observedAt: "2026-09-12T07:00:00.000Z",
    outcome: "succeeded",
    providerReference: "gid://shopify/Refund/2",
    facts: {
      orderId: "gid://shopify/Order/1",
      refundId: "gid://shopify/Refund/2",
      amount: "40.00",
      currency: "USD",
      transactionStatus: "SUCCESS",
      transactionReference: "txn-3",
      classification: "partial",
    },
    ...overrides,
  } as ReceiptV1;
}

describe("receipt v1", () => {
  it("validates exact refund facts independently of display text", () => {
    const receipt = refundReceipt();
    expect(validateToolResultReceipt({ status: "ok", message: "first wording", receipt })).toEqual(receipt);
    expect(validateToolResultReceipt({ status: "ok", message: "completely different wording", receipt })).toEqual(receipt);
  });

  it("rejects imprecise money and invalid currency", () => {
    expect(() => parseReceiptV1(refundReceipt({
      facts: { ...(refundReceipt() as Extract<ReceiptV1, { outcome: "succeeded" }>).facts, amount: 40 } as never,
    }))).toThrow(ReceiptValidationError);
    expect(() => parseReceiptV1(refundReceipt({
      facts: { ...(refundReceipt() as Extract<ReceiptV1, { outcome: "succeeded" }>).facts, currency: "usd" } as never,
    }))).toThrow("facts.currency");
  });

  it("rejects a legacy status that disagrees with the receipt outcome", () => {
    expect(() => validateToolResultReceipt({
      status: "error",
      message: "optimistic or stale display status",
      receipt: refundReceipt(),
    })).toThrow("requires tool status ok");
  });

  it("binds the receipt to the invoked tool and runtime operation", () => {
    expect(() => validateToolResultReceipt(
      { status: "ok", message: "done", receipt: refundReceipt() },
      { tool: "cancel_order" },
    )).toThrow("does not match");
    expect(() => validateToolResultReceipt(
      { status: "ok", message: "done", receipt: refundReceipt() },
      { operationId: "operation-2" },
    )).toThrow("runtime operation");
    expect(() => validateToolResultReceipt(
      { status: "ok", message: "done", receipt: refundReceipt() },
      { executionId: "execution-2" },
    )).toThrow("runtime execution");
  });

  it("binds refund target and provider reference to observed facts", () => {
    expect(() => parseReceiptV1(refundReceipt({
      target: { kind: "order", id: "different-order" },
    }))).toThrow("target");
    expect(() => parseReceiptV1(refundReceipt({ providerReference: "different-refund" }))).toThrow(
      "providerReference",
    );
  });

  it("keeps not-found and unknown outcomes distinct", () => {
    const common = {
      version: 1 as const,
      operationId: "operation-1",
      executionId: "execution-1",
      tool: "cancel_order",
      target: { kind: "order", id: "1" },
      observedAt: "2026-09-12T07:00:00.000Z",
      providerReference: null,
      code: "provider_lookup_empty",
    };
    expect(validateToolResultReceipt({
      status: "not_found",
      message: "missing",
      receipt: { ...common, outcome: "not_found" },
    })?.outcome).toBe("not_found");
    expect(validateToolResultReceipt({
      status: "unknown",
      message: "timed out",
      receipt: { ...common, outcome: "unknown" },
    })?.outcome).toBe("unknown");
  });

  it("preserves operation identity when a later local failure makes success uncertain", () => {
    const receipt = receiptAsUnknown(refundReceipt(), "budget_record_persistence_failed");

    expect(receipt).toMatchObject({
      version: 1,
      operationId: "operation-1",
      executionId: "execution-1",
      tool: "create_refund",
      target: { kind: "order", id: "gid://shopify/Order/1" },
      providerReference: "gid://shopify/Refund/2",
      outcome: "unknown",
      code: "budget_record_persistence_failed",
    });
    expect("facts" in receipt).toBe(false);
    expect(() => parseReceiptV1(receipt)).not.toThrow();
  });

  it("requires cancellation state and never accepts refund-shaped cancellation facts", () => {
    expect(() => parseReceiptV1({
      ...refundReceipt(),
      tool: "cancel_order",
    })).toThrow("facts.cancelledAt");
  });

  it("rejects unregistered receipt tools and wrong target kinds", () => {
    expect(() => parseReceiptV1({
      ...refundReceipt(),
      tool: "invented_write",
      outcome: "unknown",
      code: "uncertain",
      facts: undefined,
    })).toThrow("no receipt validator is registered");
    expect(() => parseReceiptV1({
      ...refundReceipt(),
      target: { kind: "customer", id: "customer-1" },
    })).toThrow("target must be an order");
  });
});
