import { describe, expect, it } from "vitest";
import {
  formatOperatorDispatchFailure,
  isMessageDispatchFailureMessage,
  isPlanExecutionFailureMessage,
  summarizeOperatorTurnDispatchFailure,
} from "./message-dispatch.js";

describe("message-dispatch helpers", () => {
  it("detects dispatch and plan execution failure messages", () => {
    expect(isMessageDispatchFailureMessage("Error: message dispatch failed (500).")).toBe(true);
    expect(isPlanExecutionFailureMessage("Error: message dispatch failed (500).")).toBe(true);
    expect(isPlanExecutionFailureMessage("Done.")).toBe(false);
  });

  it("formats operator-facing dispatch failures with a reference when present", () => {
    const message = "Error: message dispatch failed (500). Reference: req-123.";
    expect(formatOperatorDispatchFailure(message)).toBe(
      "I couldn't send the customer message — delivery failed. Reference: req-123. Nothing was confirmed sent; try again from the dashboard or wait a moment and retry.",
    );
  });

  it("summarizes the latest failed approval on an operator turn", () => {
    const summary = summarizeOperatorTurnDispatchFailure([
      { tool: "approve_pending_plan", result: "Error: message dispatch failed (503). Reference: req-9.", status: "success", durationMs: 1 },
    ] as never);

    expect(summary).toContain("couldn't send the customer message");
    expect(summary).toContain("req-9");
  });

  // Keyed on the declared category, not a list of tool names. The list held
  // send_reply and send_email, so a failed `send_ticket_reply` was invisible here
  // and the merchant was told the turn "required too many steps" while what had
  // actually happened was a refused send.
  it("reports any failed communication tool, including ones added later", () => {
    const summary = summarizeOperatorTurnDispatchFailure([
      { tool: "search_kb", category: "read", result: "[]", status: "success", durationMs: 1 },
      {
        tool: "send_ticket_reply",
        category: "communication",
        result: "Error: no ticket with that id is in the inbox.",
        status: "error",
        durationMs: 1,
      },
    ] as never);

    expect(summary).toBe("Error: no ticket with that id is in the inbox.");
  });

  it("stays silent when nothing customer-facing failed", () => {
    expect(summarizeOperatorTurnDispatchFailure([
      { tool: "get_ticket", category: "read", result: "Error: no ticket with that id is in the inbox.", status: "error", durationMs: 1 },
      { tool: "mark_ticket_spam", category: "action", result: "Error: nope.", status: "error", durationMs: 1 },
    ] as never)).toBeNull();
  });
});
