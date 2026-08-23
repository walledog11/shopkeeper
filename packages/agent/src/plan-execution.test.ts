import { describe, expect, it } from "vitest";
import { validateCustomerFacingApprovalSet } from "./plan-execution.js";
import type { AutonomyVerdict } from "./autonomy.js";
import type { RawToolCall } from "./types.js";

const action: RawToolCall = {
  id: "refund",
  name: "create_refund",
  input: { order_id: "1", amount: "10.00" },
};
const reply: RawToolCall = {
  id: "reply",
  name: "send_reply",
  input: { text: "I've refunded your order." },
};
const verdict: AutonomyVerdict = {
  kind: "needs_review",
  reasons: ["tier_requires_review"],
  approvalAllowed: true,
  toolCalls: [action, reply],
};

describe("validateCustomerFacingApprovalSet", () => {
  it("keeps customer copy atomic with the reviewed action set", () => {
    expect(() => validateCustomerFacingApprovalSet(verdict, [action, reply])).not.toThrow();
    expect(() => validateCustomerFacingApprovalSet(verdict, [reply]))
      .toThrow(/revised customer reply/);
  });

  it("allows a partial action-only approval when no customer copy will send", () => {
    expect(() => validateCustomerFacingApprovalSet(verdict, [action])).not.toThrow();
  });
});
