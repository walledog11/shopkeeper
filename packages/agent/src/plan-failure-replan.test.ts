import { describe, expect, it } from "vitest";
import type { ActionEntry } from "./agent-context.js";
import {
  autonomyRank,
  buildFailureReplanPlanningInstruction,
  canAttemptFailureReplan,
  childPlanRepeatsCommittedSteps,
  committedToolCallIdsForExecution,
  failureReplanAutonomyAllowed,
  remainingToolCallsAfterFailure,
} from "./plan-failure-replan.js";
import type { AgentPlan, RawToolCall } from "./types.js";

const noteCall: RawToolCall = {
  id: "note_1",
  name: "add_shopify_customer_note",
  input: { note: "VIP" },
};
const refundCall: RawToolCall = {
  id: "refund_1",
  name: "create_refund",
  input: { order_id: "1", amount: "10.00" },
};
const sendCall: RawToolCall = {
  id: "send_1",
  name: "send_reply",
  input: { text: "Done." },
};

describe("plan failure replan helpers", () => {
  it("stops approved execution remaining steps after a definite failure", () => {
    const actions: ActionEntry[] = [
      { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
      { tool: "create_refund", result: "Rejected", status: "error" },
    ];
    expect(remainingToolCallsAfterFailure([noteCall, refundCall, sendCall], actions)).toEqual([sendCall]);
    expect(committedToolCallIdsForExecution([noteCall, refundCall, sendCall], actions)).toEqual(["note_1"]);
  });

  it("refuses replan when any action is unknown", () => {
    const actions: ActionEntry[] = [
      { tool: "create_refund", result: "Unknown", status: "unknown" },
    ];
    expect(canAttemptFailureReplan({
      executionOutcome: "partial",
      actions,
      approvedToolCalls: [refundCall, sendCall],
      failureReplanAllowed: true,
    })).toBe(false);
  });

  it("allows replan after a definite partial failure with remaining work", () => {
    const actions: ActionEntry[] = [
      { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
      { tool: "create_refund", result: "Rejected", status: "error" },
    ];
    expect(canAttemptFailureReplan({
      executionOutcome: "partial",
      actions,
      approvedToolCalls: [noteCall, refundCall, sendCall],
      failureReplanAllowed: true,
    })).toBe(true);
  });

  it("blocks a child plan that repeats committed tool call ids", () => {
    const childPlan: AgentPlan = {
      instruction: "Finish",
      steps: [],
      rawToolCalls: [noteCall, sendCall],
    };
    expect(childPlanRepeatsCommittedSteps(childPlan, ["note_1"])).toBe(true);
  });

  it("does not allow raising the autonomy tier on a failure replan", () => {
    expect(failureReplanAutonomyAllowed(
      { kind: "auto_execute", reasons: [], toolCalls: [], replyText: "ok", sendReplyToolCall: sendCall },
      { kind: "auto_execute", reasons: [], toolCalls: [], replyText: "ok", sendReplyToolCall: sendCall },
    )).toBe(true);
    expect(failureReplanAutonomyAllowed(
      { kind: "auto_execute", reasons: [], toolCalls: [], replyText: "ok", sendReplyToolCall: sendCall },
      { kind: "needs_review", reasons: [], approvalAllowed: true, toolCalls: [sendCall] },
    )).toBe(false);
    expect(autonomyRank("quick_reply")).toBeLessThan(autonomyRank("needs_review"));
  });

  it("builds a planning instruction with completed steps and the failure reason", () => {
    const instruction = buildFailureReplanPlanningInstruction({
      baseInstruction: "Refund order 1042",
      committedActions: [{ tool: "add_shopify_customer_note", result: "Noted" }],
      failureTool: "create_refund",
      failureReason: "Error: refund rejected",
    });
    expect(instruction).toContain("Refund order 1042");
    expect(instruction).toContain("add_shopify_customer_note: Noted");
    expect(instruction).toContain('The step "create_refund" failed with: Error: refund rejected');
  });
});
