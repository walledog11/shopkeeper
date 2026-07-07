// Phase 2 shadow: compute the classifier-based routing decision next to the live
// regex guards without changing behavior. `computeClassifierRouting` is the
// replacement the Phase 3 swap will act on; `computeLegacyRouting` re-derives
// what today's regex guards did to the plan, in the same signal vocabulary, so
// the two can be compared per-plan on production traffic. Neither adds, removes,
// or edits tool calls.

import type { AgentContext } from "./agent-context.js";
import type { ClassifierIntents } from "./classifier-signals.js";
import {
  customerMessageTexts,
  hasContradictoryInstructionSignals,
  hasForwardedInjectionRefundSignal,
  hasMerchantPolicyGapIntent,
  hasMutativeRequestIntent,
  hasOutOfScopeCommercialRequestSignals,
  hasSuspectedFraudRefundSignals,
  planningIntentTexts,
} from "./intent.js";
import logger from "./logger.js";
import { MUTATIVE_INTENT_NO_ACTION_WARNING } from "./planner-safety/index.js";
import { refundTargetsAlreadyFullyRefunded } from "./planner-safety/refunds.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import type { RawToolCall } from "./types.js";

export type RoutingDecision = "auto_execute" | "needs_review" | "escalate";

export interface RoutingOutcome {
  decision: RoutingDecision;
  // Which intent signals drove the decision (shared vocabulary across both sides).
  signals: string[];
  warnings: string[];
}

// The four intents that route deterministically to a human in Phase 3
// (fraud / forwarded-injection / contradiction / out-of-scope), highest severity.
const ESCALATE_INTENT_KEYS = [
  "fraud_signals",
  "forwarded_injection",
  "contradiction",
  "out_of_scope_commercial",
] as const;

interface PlanShape {
  hasEscalation: boolean;
  hasAction: boolean;
  hasSendReply: boolean;
  hasAskOperator: boolean;
}

function planShape(rawToolCalls: readonly RawToolCall[]): PlanShape {
  return {
    hasEscalation: rawToolCalls.some((call) => call.name === "escalate_to_human"),
    hasAction: rawToolCalls.some((call) => TOOL_CATEGORIES[call.name] === "action"),
    hasSendReply: rawToolCalls.some((call) => call.name === "send_reply"),
    hasAskOperator: rawToolCalls.some((call) => call.name === "ask_operator"),
  };
}

// Order-state-dependent decisions (already-refunded strip, fulfilled-order cancel
// escalation) stay as structural checks in Phase 3 and are intentionally not
// re-implemented here — the routing function reads intents + plan shape only.
export function computeClassifierRouting(input: {
  intents: ClassifierIntents;
  rawToolCalls: readonly RawToolCall[];
}): RoutingOutcome {
  const { intents, rawToolCalls } = input;
  const plan = planShape(rawToolCalls);

  const escalateSignals = ESCALATE_INTENT_KEYS.filter((key) => intents[key]);
  if (escalateSignals.length > 0) {
    return { decision: "escalate", signals: [...escalateSignals], warnings: [] };
  }

  if (intents.mutative_request && !plan.hasAction && !plan.hasEscalation) {
    return {
      decision: "needs_review",
      signals: ["mutative_request"],
      warnings: [MUTATIVE_INTENT_NO_ACTION_WARNING],
    };
  }

  if (intents.policy_question && !plan.hasSendReply && !plan.hasAskOperator && !plan.hasEscalation) {
    return { decision: "needs_review", signals: ["policy_question"], warnings: [] };
  }

  return { decision: "auto_execute", signals: [], warnings: [] };
}

// Re-derives the routing outcome the current regex guards produce, from the same
// predicates they use (intent.ts) plus the final plan shape. Deterministic given
// ctx + plan, so it reproduces the guard's disposition without mutating anything.
export function computeLegacyRouting(input: {
  ctx: AgentContext;
  instruction: string;
  rawToolCalls: readonly RawToolCall[];
}): RoutingOutcome {
  const { ctx, instruction, rawToolCalls } = input;
  const plan = planShape(rawToolCalls);
  const customerTexts = customerMessageTexts(ctx);
  const intentTexts = planningIntentTexts(ctx, instruction);

  const escalateSignals: string[] = [];
  if (hasSuspectedFraudRefundSignals(...customerTexts)) escalateSignals.push("fraud_signals");
  if (hasForwardedInjectionRefundSignal(...intentTexts)) escalateSignals.push("forwarded_injection");
  if (hasContradictoryInstructionSignals(...intentTexts)) escalateSignals.push("contradiction");
  if (hasOutOfScopeCommercialRequestSignals(...customerTexts)) escalateSignals.push("out_of_scope_commercial");
  if (escalateSignals.length > 0) {
    return { decision: "escalate", signals: escalateSignals, warnings: [] };
  }

  if (
    hasMutativeRequestIntent(...customerTexts)
    && !plan.hasAction
    && !plan.hasEscalation
    && !refundTargetsAlreadyFullyRefunded(ctx, "")
  ) {
    return {
      decision: "needs_review",
      signals: ["mutative_request"],
      warnings: [MUTATIVE_INTENT_NO_ACTION_WARNING],
    };
  }

  if (
    hasMerchantPolicyGapIntent(...customerTexts)
    && !plan.hasSendReply
    && !plan.hasAskOperator
    && !plan.hasEscalation
  ) {
    return { decision: "needs_review", signals: ["policy_question"], warnings: [] };
  }

  return { decision: "auto_execute", signals: [], warnings: [] };
}

// Emits a structured comparison of the legacy regex routing vs. the
// classifier routing for one finalized plan. Pure observability — never throws
// (callers still wrap it, so a shadow bug can never break planning) and never
// touches the plan. `language` + per-side signals let the disagreement rate be
// bucketed in production (non-English vs. regex false positives).
export function logRoutingShadow(input: {
  ctx: AgentContext;
  instruction: string;
  rawToolCalls: readonly RawToolCall[];
  instructionHash: string;
}): void {
  const { ctx, instruction, rawToolCalls, instructionHash } = input;
  const signals = ctx.classifierSignals;
  const legacy = computeLegacyRouting({ ctx, instruction, rawToolCalls });
  const classifier = signals
    ? computeClassifierRouting({ intents: signals.intents, rawToolCalls })
    : null;

  logger.info(
    {
      orgId: ctx.orgId,
      threadId: ctx.thread.id,
      shadow: true,
      classifierAvailable: Boolean(signals),
      classifierVersion: signals?.version ?? null,
      language: signals?.language ?? null,
      legacyDecision: legacy.decision,
      legacyRoutingSignals: legacy.signals,
      classifierDecision: classifier?.decision ?? null,
      classifierRoutingSignals: classifier?.signals ?? null,
      routingAgreement: classifier ? classifier.decision === legacy.decision : null,
      instructionHash,
    },
    "[agent:plan:shadow] routing comparison",
  );
}
