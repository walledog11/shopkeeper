import { describe, expect, it } from "vitest";
import {
  formatOperatorDispatchFailure,
  summarizeOperatorTurnDispatchFailure,
} from "./message-dispatch.js";

describe("message-dispatch helpers", () => {
  it("surfaces the already-formatted approval failure from its typed status", () => {
    const failure = formatOperatorDispatchFailure("Error: message dispatch failed (503). Reference: req-9.");
    const summary = summarizeOperatorTurnDispatchFailure([
      { tool: "approve_pending_plan", result: failure, status: "error", durationMs: 1 },
    ] as never);

    expect(summary).toBe(failure);
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

it('does not recommend a blind retry for unknown message dispatch', () => {
  const message = formatOperatorDispatchFailure('Unknown: message dispatch may have completed. Reference: req-1.');
  expect(message).toContain('delivery may already have completed');
  expect(message).not.toContain('delivery failed');
  expect(message).not.toContain('wait a moment and retry');
});
