import { describe, expect, it } from "vitest";
import { historicalCompletionFacts, proposedCompletionFacts } from "./completion-facts.js";

describe("completion facts", () => {
  it("describes a proposed refund as proposed", () => {
    expect(proposedCompletionFacts([{
      id: "refund_1",
      name: "create_refund",
      input: { order_id: "123", amount: "20", currency: "usd" },
    }])).toEqual([expect.objectContaining({
      action: "refund",
      target: { kind: "order", id: "123" },
      amount: "20.00",
      currency: "USD",
      outcome: "proposed",
      executionReference: "refund_1",
      sourceTool: "create_refund",
    })]);
  });

  it("takes an order alias from this turn's read when context has no such order", () => {
    const calls = [
      { id: "read", name: "get_order_by_name", input: { order_name: "1031" } },
      { id: "refund", name: "create_refund", input: { order_id: "6163445514474", amount: "43.48" } },
    ];
    const readResults = {
      read: JSON.stringify({ id: "6163445514474", name: "#1031", currency: "USD" }),
    };

    expect(proposedCompletionFacts(calls, undefined, readResults)).toEqual([
      expect.objectContaining({
        action: "refund",
        target: { kind: "order", id: "6163445514474", aliases: ["#1031"] },
      }),
    ]);
    expect(proposedCompletionFacts(calls)).toEqual([
      expect.objectContaining({ target: { kind: "order", id: "6163445514474" } }),
    ]);
  });

  it("turns only successful live order reads into historical facts", () => {
    const calls = [{ id: "read_1", name: "get_order_by_name", input: { order_name: "#1001" } }];
    expect(historicalCompletionFacts(calls, {
      read_1: JSON.stringify({
        id: "123",
        name: "#1001",
        financial_status: "refunded",
        fulfillment_status: "fulfilled",
        total_price: "20.00",
        currency: "USD",
      }),
    })).toEqual([
      expect.objectContaining({ action: "refund", outcome: "success", executionReference: "read:read_1" }),
      expect.objectContaining({ action: "fulfillment", outcome: "success", executionReference: "read:read_1" }),
    ]);
    expect(historicalCompletionFacts(calls, { read_1: "No order found." })).toEqual([]);
  });
});
