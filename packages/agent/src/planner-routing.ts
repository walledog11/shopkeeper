// Phase 2 shadow: compute the classifier-based routing decision next to the live
// regex guards without changing behavior. `computeClassifierRouting` is the
// replacement the Phase 3 swap will act on; `computeLegacyRouting` re-derives
// what today's regex guards did to the plan, in the same signal vocabulary, so
// the two can be compared per-plan on production traffic. Neither adds, removes,
// or edits tool calls.

import type Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "./agent-context.js";
import type { ClassifierIntents } from "./classifier-signals.js";
import {
  customerMessageTexts,
  hasActionableMutativeIntent,
  hasContradictoryInstructionSignals,
  hasForwardedInjectionRefundSignal,
  hasMerchantPolicyGapIntent,
  hasMutativeRequestIntent,
  hasOutOfScopeCommercialRequestSignals,
  hasSuspectedFraudRefundSignals,
  planningIntentTexts,
} from "./intent.js";
import logger from "./logger.js";
import {
  CIRCULAR_CHANNEL_DEFLECTION_WARNING,
  hasAmbiguousCustomerSearchResult,
  hasCriticalPlanningReadErrorsForBlocks,
  MUTATIVE_INTENT_NO_ACTION_WARNING,
  sendReplyDeflectsToManagedChannels,
  shouldEscalateFulfilledCancelRequest,
} from "./planner-safety/index.js";
import { refundTargetsAlreadyFullyRefunded } from "./planner-safety/refunds.js";
import type { ToolStatus } from "./tools/result.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import type { RawToolCall, RoutingDecision } from "./types.js";

export type { RoutingDecision };

export interface RoutingOutcome {
  decision: RoutingDecision;
  // Which intent signals drove the decision (shared vocabulary across both sides).
  signals: string[];
  warnings: string[];
  // Set only for `escalate`: the templated reason the system writes into the
  // deterministic escalate_to_human call (never model-authored).
  escalationReason?: string;
  // Set only for a policy-gap `needs_review`: the merchant-facing question.
  question?: string | null;
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

// Human-readable escalation reasons keyed by the signal that fired. The system
// writes these verbatim into the deterministic escalate_to_human call — escalation
// is a routing decision, not model-generated content.
const ESCALATION_REASONS: Record<string, string> = {
  fraud_signals:
    "Possible fraud signals (chargeback, alternate-card refund, or urgent non-receipt) — needs human review.",
  forwarded_injection:
    "Message claims a prior authorization for a refund — needs human verification.",
  contradiction:
    "Customer made contradictory requests in one message — needs a human to clarify.",
  out_of_scope_commercial:
    "Wholesale, bulk, or B2B inquiry — out of scope for automated support.",
  fulfilled_cancel:
    "Cancellation requested for an already-fulfilled order — needs human review.",
  ambiguous_customer:
    "Multiple matching customers found — needs a human to confirm identity.",
  read_error:
    "Order or customer lookup failed — could not verify details to act safely.",
};

function reasonFromSignals(signals: readonly string[]): string {
  const reasons = signals.map((signal) => ESCALATION_REASONS[signal]).filter(Boolean);
  return reasons.length > 0 ? reasons.join(" ") : "Needs human review.";
}

// A merchant-facing question for a policy gap the plan could not answer. Reuses
// the last customer message, mirroring the old buildPolicyGapAskOperatorCall text.
function buildMerchantRoutingQuestion(ctx: AgentContext): string {
  const customerTexts = customerMessageTexts(ctx);
  const latest = customerTexts[customerTexts.length - 1]?.trim() ?? "this question";
  return `What should I tell the customer about: "${latest}"?`;
}

export interface RoutePlanInput {
  ctx: AgentContext;
  instruction: string;
  rawToolCalls: readonly RawToolCall[];
  readBlocks: readonly Anthropic.ToolUseBlock[];
  readStatusMap: ReadonlyMap<string, ToolStatus>;
  readResultsMap: ReadonlyMap<string, string>;
}

// Structural escalations that do not read customer prose: they compare plan tool
// calls / read results against order + customer state. Lifted out of the old
// shouldForcePlanningEscalation (the fraud/injection/contradiction/out-of-scope
// branches now come from the classifier/regex intent routing instead).
function structuralEscalationSignal(input: RoutePlanInput): string | null {
  const { ctx, instruction } = input;
  if (shouldEscalateFulfilledCancelRequest(ctx, instruction)) return "fulfilled_cancel";
  if (hasAmbiguousCustomerSearchResult(input.readBlocks, input.readResultsMap)) {
    return "ambiguous_customer";
  }
  if (hasCriticalPlanningReadErrorsForBlocks(input.readBlocks, input.readStatusMap)) {
    const customerTexts = customerMessageTexts(ctx);
    if (hasActionableMutativeIntent(...customerTexts) || ctx.recentOrders.length === 0) {
      return "read_error";
    }
  }
  return null;
}

// The live Phase 3 routing decision: classify a finalized plan without editing
// its tool calls. Structural escalations win, then classifier/regex intent
// routing, then structural needs_review (channel deflection), then auto_execute.
// The caller (planAgent) acts on the outcome — it materializes escalation and
// records the disposition on the plan.
export function routePlan(input: RoutePlanInput): RoutingOutcome {
  const { ctx, instruction, rawToolCalls } = input;

  const structuralSignal = structuralEscalationSignal(input);
  if (structuralSignal) {
    return {
      decision: "escalate",
      signals: [structuralSignal],
      warnings: [],
      escalationReason: reasonFromSignals([structuralSignal]),
    };
  }

  const intentOutcome = ctx.classifierSignals
    ? computeClassifierRouting({ intents: ctx.classifierSignals.intents, rawToolCalls })
    : computeLegacyRouting({ ctx, instruction, rawToolCalls });

  if (intentOutcome.decision === "escalate") {
    return { ...intentOutcome, escalationReason: reasonFromSignals(intentOutcome.signals) };
  }

  const signals = [...intentOutcome.signals];
  const warnings = [...intentOutcome.warnings];
  let needsReview = intentOutcome.decision === "needs_review";

  if (rawToolCalls.some(sendReplyDeflectsToManagedChannels)) {
    if (!signals.includes("channel_deflection")) signals.push("channel_deflection");
    if (!warnings.includes(CIRCULAR_CHANNEL_DEFLECTION_WARNING)) {
      warnings.push(CIRCULAR_CHANNEL_DEFLECTION_WARNING);
    }
    needsReview = true;
  }

  const question = signals.includes("policy_question") ? buildMerchantRoutingQuestion(ctx) : null;

  return {
    decision: needsReview ? "needs_review" : "auto_execute",
    signals,
    warnings,
    question,
  };
}

// Materializes an `escalate` routing decision onto the plan: keep reads, drop
// every other tool call, and terminate with a single escalate_to_human. If the
// model already elected escalation, its call (and reason) is preserved.
export function applyEscalationRouting(
  rawToolCalls: readonly RawToolCall[],
  reason: string,
): RawToolCall[] {
  const reads = rawToolCalls.filter((toolCall) => TOOL_CATEGORIES[toolCall.name] === "read");
  const existing = rawToolCalls.find((toolCall) => toolCall.name === "escalate_to_human");
  if (existing) return [...reads, existing];
  return [
    ...reads,
    { id: "tu_route_escalate", name: "escalate_to_human", input: { reason } },
  ];
}
