import { describe, expect, it } from "vitest";
import { formatGateSummary, mutativeIntentActionFailures, summarizeGates } from "./runner";
import type { FixtureRunSummary } from "./types";

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
