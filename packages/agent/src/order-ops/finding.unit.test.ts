import { describe, expect, it } from "vitest";
import {
  buildFlagOrderInput,
  buildOrderRiskInstruction,
  formatFlagOrderSummary,
  legacyOrderNameFromSummary,
  parseOrderRiskInstruction,
  readFlagOrderFinding,
} from "./finding.js";

describe("flag_order finding contract", () => {
  it("records the order identity alongside the model's reason", () => {
    expect(buildFlagOrderInput(
      { reason: "billing/shipping country mismatch" },
      { orderId: "7317445509440", orderName: "#PG1013" },
    )).toEqual({
      reason: "billing/shipping country mismatch",
      orderId: "7317445509440",
      orderName: "#PG1013",
    });
  });

  // The model is given only `reason`; it must not be able to name a different
  // order than the one under review by putting one in its tool input.
  it("lets the context override an order the model tried to name", () => {
    const input = buildFlagOrderInput(
      { reason: "looks fine", orderId: "someone-elses-order", orderName: "#EVIL" },
      { orderId: "7317445509440", orderName: "#PG1013" },
    );
    expect(input.orderId).toBe("7317445509440");
    expect(input.orderName).toBe("#PG1013");
  });

  it("round-trips the instruction", () => {
    expect(parseOrderRiskInstruction(buildOrderRiskInstruction("7317445509440")))
      .toEqual({ orderId: "7317445509440" });
    expect(parseOrderRiskInstruction("other:123")).toBeNull();
    expect(parseOrderRiskInstruction(null)).toBeNull();
    expect(parseOrderRiskInstruction("order-risk-review:  ")).toBeNull();
  });

  it("reads a finding out of a recorded row", () => {
    expect(readFlagOrderFinding({
      input: buildFlagOrderInput(
        { reason: "high-value first order" },
        { orderId: "7317445509440", orderName: "#PG1013" },
      ),
      instruction: buildOrderRiskInstruction("7317445509440"),
      summary: formatFlagOrderSummary("#PG1013", "high-value first order"),
    })).toEqual({
      orderId: "7317445509440",
      orderName: "#PG1013",
      reason: "high-value first order",
    });
  });

  // This is the assertion that keeps the fallback honest: it parses whatever
  // formatFlagOrderSummary actually emits, not a sentence copied into a test.
  it("recovers the identity from a summary written before it was structured", () => {
    const summary = formatFlagOrderSummary("#PG1013", "shipping address mismatch");
    expect(legacyOrderNameFromSummary(summary)).toBe("#PG1013");

    expect(readFlagOrderFinding({
      input: { reason: "shipping address mismatch" },
      instruction: buildOrderRiskInstruction("7317445509440"),
      summary,
    })).toEqual({
      orderId: "7317445509440",
      orderName: "#PG1013",
      reason: "shipping address mismatch",
    });
  });

  it("recovers a reason that only ever reached the summary", () => {
    expect(readFlagOrderFinding({
      input: {},
      instruction: buildOrderRiskInstruction("998877"),
      summary: formatFlagOrderSummary("#2", "summary tail reason"),
    })).toEqual({
      orderId: "998877",
      orderName: "#2",
      reason: "summary tail reason",
    });
  });

  // A reason containing the delimiter used to truncate at the first match.
  it("keeps a reason that contains the summary's own delimiter", () => {
    expect(readFlagOrderFinding({
      input: {},
      instruction: null,
      summary: formatFlagOrderSummary("#2", "held for review: address mismatch"),
    }).reason).toBe("held for review: address mismatch");
  });

  it("degrades to a placeholder when the row carries nothing usable", () => {
    expect(readFlagOrderFinding({ input: null, instruction: null, summary: null })).toEqual({
      orderId: null,
      orderName: "An order",
      reason: "Flagged for review",
    });

    expect(readFlagOrderFinding({
      input: null,
      instruction: buildOrderRiskInstruction("998877"),
      summary: "Flagged order.",
    })).toEqual({
      orderId: "998877",
      orderName: "Order 998877",
      reason: "Flagged for review",
    });
  });
});
