import { describe, expect, it } from "vitest";
import { planExecutionOutcomeForActions } from "./execution-outcome.js";

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
});
