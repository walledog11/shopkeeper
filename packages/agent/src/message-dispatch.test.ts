import { afterEach, describe, expect, it } from "vitest";
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
});
