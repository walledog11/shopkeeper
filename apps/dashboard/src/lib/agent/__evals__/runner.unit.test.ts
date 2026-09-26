import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  quoteFullRefundForApproval,
  quotePartialRefundForApproval,
} from "@shopkeeper/agent/shopify";
import type { AgentPlan } from "@/types";
import { collectPlanExpectationFailures } from "./assertions";
import {
  formatGateSummary,
  formatUsageDelta,
  hardFailureConfirmations,
  installSimulatedShopifyRest,
  mutativeIntentActionFailures,
  selectBaselineFixtures,
  shouldVerifyExpectedActions,
  summarizeGates,
  summarizeResults,
} from "./runner";
import type { EvalBaseline, Fixture, FixtureRunSummary, PhaseUsage } from "./types";

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

describe("release gate controls", () => {
  it("uses two confirmations for the compatibility retry flag", () => {
    const previousConfirmations = process.env.EVAL_CONFIRM_HARD_FAILURES;
    const previousRetry = process.env.EVAL_RETRY_HARD;
    delete process.env.EVAL_CONFIRM_HARD_FAILURES;
    process.env.EVAL_RETRY_HARD = "1";
    expect(hardFailureConfirmations()).toBe(2);
    if (previousConfirmations === undefined) delete process.env.EVAL_CONFIRM_HARD_FAILURES;
    else process.env.EVAL_CONFIRM_HARD_FAILURES = previousConfirmations;
    if (previousRetry === undefined) delete process.env.EVAL_RETRY_HARD;
    else process.env.EVAL_RETRY_HARD = previousRetry;
  });

  it("projects a mixed baseline onto hard-gated fixture IDs", () => {
    const baseline = summarizeResults([
      { id: "hard-a", repeats: 3, passes: 3, passRate: 1, results: [] },
      { id: "soft-a", repeats: 3, passes: 0, passRate: 0, results: [] },
    ]) as EvalBaseline;
    const hard = selectBaselineFixtures(baseline, new Set(["hard-a"]));
    expect(hard).toMatchObject({ total: 3, passed: 3, passRate: 1 });
    expect(hard.fixtures).toEqual({ "hard-a": { repeats: 3, passes: 3, passRate: 1 } });
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
      whyModelNeeded: "test",
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
      'expected decideAutonomy -> one of ["quick_reply", "needs_review"], got "needs_merchant_input"; reasons=[explicit_merchant_question]; called: [ask_operator({"question":"Should I refund this order?"})]',
    ]);
  });
});

describe("runtime-v2 proposal expectations", () => {
  // Runtime v2 used to stop at the write and compose the reply afterwards, so
  // its write proposals were excused from reply assertions. Its proposals now
  // carry the exact draft the merchant approves, so they are held to the same
  // reply requirement as every other plan.
  const fixture: Fixture = {
    id: "exact-draft-proposal",
    description: "v2 drafts the reply with the write",
    whyModelNeeded: "test",
    suite: "core",
    setup: { channelType: "email", messages: [] },
    instruction: "Change the address",
    expectedPlan: {
      mustCallTools: ["update_shopify_order_address", "send_reply"],
      mustCallToolsInOrder: ["update_shopify_order_address", "send_reply"],
      replyMustInclude: ["updated"],
    },
  };
  const proposal: AgentPlan = {
    instruction: "Change the address",
    steps: [],
    rawToolCalls: [{
      id: "write-1",
      name: "update_shopify_order_address",
      input: { order_id: "order-1" },
    }],
  };

  it("requires the reply a v2 proposal now drafts", () => {
    const result = collectPlanExpectationFailures(fixture, proposal);
    expect(result.failures).toContain(
      'expected tool "send_reply" to be called; called: [update_shopify_order_address({"order_id":"order-1"})]',
    );
    expect(result.failures).toContain('reply missing "updated"; reply was: ""');
  });
});

describe("fixture action verification", () => {
  const expectedActions: NonNullable<Fixture["expectedPlan"]["expectedAgentActions"]> = [{
    tool: "create_refund",
    status: "success",
    mode: "auto_executed",
  }];

  it("does not execute a plan that already failed its shape assertions", () => {
    expect(shouldVerifyExpectedActions(expectedActions, 1)).toBe(false);
  });

  it("verifies expected action rows only after the plan shape passes", () => {
    expect(shouldVerifyExpectedActions(expectedActions, 0)).toBe(true);
    expect(shouldVerifyExpectedActions(undefined, 0)).toBe(false);
  });
});

describe("installSimulatedShopifyRest", () => {
  function loadFixture(id: string): Fixture {
    return JSON.parse(readFileSync(new URL(`./fixtures/${id}.json`, import.meta.url), "utf8")) as Fixture;
  }

  it("prices the refund fixtures from their declared Shopify responses", async () => {
    const full = loadFixture("refund-full-order");
    const restoreFull = installSimulatedShopifyRest(full);
    try {
      await expect(quoteFullRefundForApproval({ order_id: "9000001010" }, full.setup.shopify!))
        .resolves.toMatchObject({ amount: "42.00", currency: "USD" });
    } finally {
      restoreFull();
    }

    const partial = loadFixture("refund-partial");
    const restorePartial = installSimulatedShopifyRest(partial);
    try {
      await expect(quotePartialRefundForApproval(
        { order_id: "9000001021", items: [{ line_item_id: "lineitem_1021a", quantity: 1 }] },
        partial.setup.shopify!,
      )).resolves.toMatchObject({ approval_amount: "38.00", approval_currency: "USD" });
    } finally {
      restorePartial();
    }
  });

  it("refuses an undeclared request to the fixture shop and restores fetch", async () => {
    const original = globalThis.fetch;
    const fixture = loadFixture("refund-full-order");
    const restore = installSimulatedShopifyRest(fixture);
    try {
      await expect(fetch("https://test-store.myshopify.com/admin/api/2025-01/orders/1.json"))
        .rejects.toThrow("unsimulated Shopify request GET orders/1.json in fixture refund-full-order");
    } finally {
      restore();
    }
    expect(globalThis.fetch).toBe(original);
  });
});
