import { describe, expect, it } from "vitest";
import type { AgentPlan } from "@/types";
import { collectPlanExpectationFailures } from "./assertions";
import { formatGateSummary, formatUsageDelta, mutativeIntentActionFailures, summarizeGates } from "./runner";
import type { Fixture, FixtureRunSummary, PhaseUsage } from "./types";

describe("summarizeGates", () => {
  const summaries: FixtureRunSummary[] = [
    { id: "hard-a", repeats: 3, passes: 3, passRate: 1, results: [] },
    { id: "hard-b", repeats: 3, passes: 1, passRate: 1 / 3, results: [] },
    { id: "soft-a", repeats: 3, passes: 0, passRate: 0, results: [] },
  ];
  const fixtures = [
    { id: "hard-a", advisory: false as const },
    { id: "hard-b" },
    { id: "soft-a", advisory: true as const },
  ];

  it("splits run-weighted pass rates by advisory flag", () => {
    const gates = summarizeGates(summaries, fixtures);
    expect(gates.hardGated).toEqual({ fixtureCount: 2, total: 6, passed: 4, passRate: 4 / 6 });
    expect(gates.advisory).toEqual({ fixtureCount: 1, total: 3, passed: 0, passRate: 0 });
  });

  it("formats a CI-parseable gate summary line", () => {
    const line = formatGateSummary(summarizeGates(summaries, fixtures));
    expect(line).toBe("[eval:gates] hard-gated 4/6 (66.7%) | advisory 0/3 (0.0%)");
  });
});

describe("formatUsageDelta", () => {
  const phase = (outputTokens: number, inputTokens: number): PhaseUsage => ({
    outputTokens,
    inputTokens,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  });

  it("normalizes per run so a different fixture count still compares", () => {
    // 4000 output over 4 runs vs 4000 over 2: same totals, half the cost per run.
    // Comparing totals here would report no change at all.
    const line = formatUsageDelta(
      { runs: 4, planner: phase(4000, 1000), run: phase(0, 0), judge: phase(0, 0) },
      { runs: 2, planner: phase(4000, 1000), run: phase(0, 0), judge: phase(0, 0) },
    );
    expect(line).toContain("out/run 1000 vs 2000 (-50.0%)");
    expect(line).toContain("prompt/run 250 vs 500 (-50.0%)");
  });

  it("signs an increase", () => {
    const line = formatUsageDelta(
      { runs: 1, planner: phase(150, 0), run: phase(0, 0), judge: phase(0, 0) },
      { runs: 1, planner: phase(100, 0), run: phase(0, 0), judge: phase(0, 0) },
    );
    expect(line).toContain("out/run 150 vs 100 (+50.0%)");
  });
});

describe("mutativeIntentActionFailures", () => {
  it("does nothing when the flag is off", () => {
    expect(mutativeIntentActionFailures({
      enabled: false,
      customerTexts: ["Please refund order #4003."],
      rawToolCalls: [{ name: "send_reply" }],
    })).toEqual([]);
  });

  it("does nothing when customer text has no mutative intent", () => {
    expect(mutativeIntentActionFailures({
      enabled: true,
      customerTexts: ["Where is my order #4003?"],
      rawToolCalls: [{ name: "send_reply" }],
    })).toEqual([]);
  });

  it("fails on a hollow reply-only refund plan", () => {
    expect(mutativeIntentActionFailures({
      enabled: true,
      customerTexts: ["Please refund order #4003."],
      rawToolCalls: [{ name: "send_reply" }],
    })).toEqual([
      "mutative intent present but plan is reply-only (send_reply without action or escalation); called: [send_reply]",
    ]);
  });

  it("passes when an action tool is planned", () => {
    expect(mutativeIntentActionFailures({
      enabled: true,
      customerTexts: ["Please refund order #4003."],
      rawToolCalls: [{ name: "create_refund" }, { name: "send_reply" }],
    })).toEqual([]);
  });

  it("passes when the plan escalates instead of acting", () => {
    expect(mutativeIntentActionFailures({
      enabled: true,
      customerTexts: ["Please refund order #4003."],
      rawToolCalls: [{ name: "escalate_to_human" }],
    })).toEqual([]);
  });

  it("passes when mutative intent is present but no reply was drafted", () => {
    expect(mutativeIntentActionFailures({
      enabled: true,
      customerTexts: ["Please refund order #4003."],
      rawToolCalls: [{ name: "get_shopify_orders" }],
    })).toEqual([]);
  });
});

describe("classification expectations", () => {
  const merchantInputPlan: AgentPlan = {
    instruction: "Handle the request",
    steps: [],
    rawToolCalls: [{
      id: "ask-1",
      name: "ask_operator",
      input: { question: "Should I refund this order?" },
    }],
  };

  function fixture(mustClassifyAs: Fixture["expectedPlan"]["mustClassifyAs"]): Fixture {
    return {
      id: "classification-test",
      description: "classification expectation test",
      suite: "core",
      setup: {
        channelType: "email",
        messages: [],
      },
      instruction: "Handle the request",
      expectedPlan: { mustClassifyAs },
    };
  }

  it("accepts any classification in an allowed list", () => {
    expect(
      collectPlanExpectationFailures(
        fixture(["needs_review", "needs_merchant_input"]),
        merchantInputPlan,
      ).failures,
    ).toEqual([]);
  });

  it("reports a classification outside the allowed list", () => {
    expect(
      collectPlanExpectationFailures(
        fixture(["quick_reply", "needs_review"]),
        merchantInputPlan,
      ).failures,
    ).toEqual([
      'expected classifyHomePlan -> one of ["quick_reply", "needs_review"], got "needs_merchant_input"',
    ]);
  });
});
