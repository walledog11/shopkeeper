import { describe, expect, it } from "vitest";
import { validateCustomerFacingApprovalSet } from "./plan-execution.js";
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
const escalate: RawToolCall = {
  id: "escalate",
  name: "escalate_to_human",
  input: { reason: "Over the refund cap." },
};
const plan = { rawToolCalls: [action, reply] };

describe("validateCustomerFacingApprovalSet", () => {
  it("keeps customer copy atomic with the reviewed action set", () => {
    expect(() => validateCustomerFacingApprovalSet(plan, [action, reply])).not.toThrow();
    expect(() => validateCustomerFacingApprovalSet(plan, [reply]))
      .toThrow(/revised customer reply/);
  });

  // An escalating plan's verdict names none of its calls, so comparing with it
  // refused the merchant's approval of the unchanged card.
  it("compares with the plan the card shows, not the verdict's subset", () => {
    expect(() => validateCustomerFacingApprovalSet(
      { rawToolCalls: [action, reply, escalate] }, [action, reply, escalate],
    )).not.toThrow();
  });

  it("allows a partial action-only approval when no customer copy will send", () => {
    expect(() => validateCustomerFacingApprovalSet(plan, [action])).not.toThrow();
  });
});
