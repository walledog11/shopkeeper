import { describe, expect, it } from "vitest";
import {
  decidePlannerTier,
  isLowRiskPlanOutcome,
  resolvePlannerTierMode,
} from "./planner-model-tier.js";
import type { ClassifierIntents } from "./classifier-signals.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import type { RawToolCall } from "./types.js";

function intents(overrides: Partial<ClassifierIntents> = {}): ClassifierIntents {
  return {
    mutative_request: false,
    policy_question: false,
    order_status: false,
    fraud_signals: false,
    contradiction: false,
    out_of_scope_commercial: false,
    forwarded_injection: false,
    ...overrides,
  };
}

function ctx(overrides: Partial<ClassifierIntents> | null) {
  return {
    classifierSignals: overrides === null
      ? null
      : { intents: intents(overrides) } as never,
  };
}

function call(name: string): RawToolCall {
  return { id: `tc_${name}`, name, input: {} } as RawToolCall;
}

const ON = { operatorMode: false, mode: "low_risk_haiku" as const };

describe("resolvePlannerTierMode", () => {
  it("defaults to off so the cheap tier is never silently live", () => {
    expect(resolvePlannerTierMode(undefined)).toBe("off");
    expect(resolvePlannerTierMode("")).toBe("off");
  });

  it("rejects an unrecognized value rather than guessing", () => {
    expect(() => resolvePlannerTierMode("haiku")).toThrow(/AGENT_PLANNER_TIER_MODE/);
  });
});

describe("decidePlannerTier", () => {
  it("downgrades a plain policy or order-status question", () => {
    expect(decidePlannerTier(ctx({ policy_question: true }), ON))
      .toEqual({ useLowTier: true, reason: "eligible" });
    expect(decidePlannerTier(ctx({ order_status: true }), ON))
      .toEqual({ useLowTier: true, reason: "eligible" });
  });

  it("stays on the judgment tier when the flag is off", () => {
    expect(decidePlannerTier(ctx({ policy_question: true }), {
      operatorMode: false,
      mode: "off",
    })).toEqual({ useLowTier: false, reason: "mode_off" });
  });

  it("never downgrades an operator turn", () => {
    expect(decidePlannerTier(ctx({ policy_question: true }), {
      operatorMode: true,
      mode: "low_risk_haiku",
    })).toEqual({ useLowTier: false, reason: "operator_mode" });
  });

  it("requires a positive signal — absence of risk is not enough", () => {
    // Nothing dangerous fired, but nothing identified it as informational either.
    expect(decidePlannerTier(ctx({}), ON))
      .toEqual({ useLowTier: false, reason: "no_qualifying_intent" });
  });

  it("fails safe when the ticket was never classified", () => {
    expect(decidePlannerTier(ctx(null), ON))
      .toEqual({ useLowTier: false, reason: "no_classifier_signals" });
  });

  it.each([
    "mutative_request",
    "fraud_signals",
    "contradiction",
    "out_of_scope_commercial",
    "forwarded_injection",
  ] as const)("keeps the judgment tier when %s fires alongside a qualifying intent", (risk) => {
    expect(decidePlannerTier(ctx({ policy_question: true, [risk]: true }), ON))
      .toEqual({ useLowTier: false, reason: "risk_intent" });
  });
});

describe("isLowRiskPlanOutcome", () => {
  it("accepts reads plus a reply", () => {
    expect(isLowRiskPlanOutcome([
      call("get_shopify_orders"),
      call("search_kb"),
      call("send_reply"),
    ])).toBe(true);
  });

  it("accepts the agent declining to act", () => {
    // Escalating and asking are the directions we want a weaker model to fail in.
    expect(isLowRiskPlanOutcome([call("escalate_to_human")])).toBe(true);
    expect(isLowRiskPlanOutcome([call("ask_operator")])).toBe(true);
  });

  it("accepts thread bookkeeping alongside the reply", () => {
    // Otherwise "reply, then close the ticket" — a perfectly ordinary quick
    // reply — would be discarded and re-planned, spending the savings.
    expect(isLowRiskPlanOutcome([
      call("send_reply"),
      call("update_thread_status"),
      call("update_thread_tag"),
      call("add_internal_note"),
    ])).toBe(true);
  });

  it("rejects any plan that would move money or change an order", () => {
    expect(isLowRiskPlanOutcome([call("create_refund")])).toBe(false);
    expect(isLowRiskPlanOutcome([call("cancel_order")])).toBe(false);
    // Mixed: a legitimate reply does not launder the mutative call beside it.
    expect(isLowRiskPlanOutcome([call("send_reply"), call("create_refund")])).toBe(false);
  });

  it("rejects every action-category tool, so a new one is safe on the day it lands", () => {
    const actionTools = Object.entries(TOOL_CATEGORIES)
      .filter(([, category]) => category === "action")
      .map(([name]) => name);
    expect(actionTools.length).toBeGreaterThan(5);
    for (const name of actionTools) {
      expect(isLowRiskPlanOutcome([call(name)])).toBe(false);
    }
  });

  it("fails closed on a tool name it does not recognize", () => {
    expect(isLowRiskPlanOutcome([call("some_tool_that_does_not_exist")])).toBe(false);
  });

  it("treats an empty plan as low risk", () => {
    expect(isLowRiskPlanOutcome([])).toBe(true);
  });
});
