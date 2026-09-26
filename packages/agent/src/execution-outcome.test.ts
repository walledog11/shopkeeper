import { describe, expect, it } from "vitest";
import {
  committedWithUnsentReply,
  isDefinitePlanExecutionFailure,
  isUnknownPlanExecution,
  ledgerStatusForPlanOutcome,
  planExecutionOutcomeForActions,
} from "./execution-outcome.js";

describe("planExecutionOutcomeForActions", () => {
  it("distinguishes committed, failed, partial, and unknown outcomes", () => {
    expect(planExecutionOutcomeForActions([])).toBe("committed");
    expect(planExecutionOutcomeForActions([{ status: "success" }])).toBe("committed");
    expect(planExecutionOutcomeForActions([{ status: "escalated" }])).toBe("committed");
    expect(planExecutionOutcomeForActions([{ status: "error" }])).toBe("failed");
    expect(planExecutionOutcomeForActions([{ status: "policy_block" }])).toBe("failed");
    expect(planExecutionOutcomeForActions([
      { status: "success" },
      { status: "error" },
    ])).toBe("partial");
    expect(planExecutionOutcomeForActions([
      { status: "success" },
      { status: "unknown" },
    ])).toBe("unknown");
  });

  it("judges a plan by its effects, and a reply as delivery", () => {
    const refund = { tool: "create_refund", status: "success" as const };
    const withheldReply = { tool: "send_reply", status: "error" as const };
    const failedRead = { tool: "get_order_by_name", status: "error" as const };

    // Gate C run 4: the write committed and the composed reply was withheld.
    expect(planExecutionOutcomeForActions([refund, withheldReply])).toBe("committed");
    expect(committedWithUnsentReply([refund, withheldReply])).toBe(true);
    expect(planExecutionOutcomeForActions([refund, failedRead, withheldReply])).toBe("committed");
    // A failed effect still fails the plan, whatever the reply did.
    expect(planExecutionOutcomeForActions([
      refund, { tool: "cancel_order", status: "policy_block" as const }, withheldReply,
    ])).toBe("partial");
    // A reply-only plan is judged by the reply.
    expect(planExecutionOutcomeForActions([withheldReply])).toBe("failed");
    expect(committedWithUnsentReply([withheldReply])).toBe(false);
    expect(committedWithUnsentReply([refund, { tool: "send_reply", status: "success" as const }])).toBe(false);
    // Uncertain delivery still outranks a known outcome.
    expect(planExecutionOutcomeForActions([refund, { tool: "send_email", status: "unknown" as const }])).toBe("unknown");
    // A persisted row's category is honored when the tool is not in the registry.
    expect(planExecutionOutcomeForActions([
      refund, { tool: "operator_message", category: "communication", status: "error" },
    ])).toBe("committed");
  });

  it("maps partial failures to the failed ledger status", () => {
    expect(ledgerStatusForPlanOutcome("partial")).toBe("failed");
    expect(isDefinitePlanExecutionFailure("partial")).toBe(true);
    expect(isUnknownPlanExecution("unknown")).toBe(true);
    expect(isDefinitePlanExecutionFailure("unknown")).toBe(false);
  });
});
