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
  shouldEscalateFulfilledAddressChangeRequest,
  shouldEscalateFulfilledCancelRequest,
} from "./planner-safety/index.js";
import {
  refundTargetsAlreadyFullyRefunded,
  refundTargetsNonPaidOrder,
} from "./planner-safety/refunds.js";
import type { ToolStatus } from "./tools/result.js";
import { getToolDefinition, TOOL_CATEGORIES } from "./tools/registry/index.js";
import { merchantRoutingQuestionFromCustomerMessage } from "./plan-preview.js";
import { isMerchantAnswerPlanningInstruction } from "./kb-learned.js";
import type { OrgSettings, RawToolCall, RoutingDecision } from "./types.js";

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

function hasExplicitCompensationRequest(ctx: AgentContext): boolean {
  // This enforcement sits on the production classifier path. Preserve the
  // legacy no-signal fallback, and do not reinterpret a classified policy
  // question merely because its prose contains the word "refund".
  if (!ctx.classifierSignals?.intents.mutative_request) return false;
  if (ctx.classifierSignals.intents.policy_question) return false;
  return customerMessageTexts(ctx).some((text) => {
    const lower = text.toLowerCase();
    const explicitRefund = /\brefund(?:ed|ing|s)?\b/.test(lower)
      && hasMutativeRequestIntent(text);
    const explicitGiftCard = (
      /\b(?:send|give|issue|create|provide)\b[^.?!]{0,48}\b(?:gift card|store credit)\b/.test(lower)
      || /\bcredit\s+(?:my|the|this)\s+account\b/.test(lower)
    );
    return explicitRefund || explicitGiftCard;
  });
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
  fulfilled_address_change:
    "Address change requested for an already-fulfilled order — needs human review.",
  already_refunded:
    "Refund requested for an order that is already fully refunded — needs human review.",
  non_paid_refund:
    "Refund requested for an order whose payment is not in the paid state — needs human review.",
  compensation_exception:
    "Compensation was requested but the plan contains no safe compensation action — needs human review.",
  ambiguous_customer:
    "Multiple matching customers found — needs a human to confirm identity.",
  read_error:
    "Order or customer lookup failed — could not verify details to act safely.",
  over_compensation_cap:
    "Compensation above the workspace limit was planned — needs human review.",
};

function reasonFromSignals(signals: readonly string[]): string {
  const reasons = signals.map((signal) => ESCALATION_REASONS[signal]).filter(Boolean);
  return reasons.length > 0 ? reasons.join(" ") : "Needs human review.";
}

function buildMerchantRoutingQuestion(ctx: AgentContext): string {
  const customerTexts = customerMessageTexts(ctx);
  return merchantRoutingQuestionFromCustomerMessage(customerTexts[customerTexts.length - 1]);
}

function planSearchedKbWithNoResults(input: RoutePlanInput): boolean {
  return input.readBlocks.some(
    (block) => block.name === "search_kb" && input.readStatusMap.get(block.id) === "not_found",
  );
}

function isRoutineOrderStatusReply(input: RoutePlanInput): boolean {
  const { ctx } = input;
  if (!ctx.classifierSignals?.intents.order_status) return false;
  if (ctx.recentOrders.length === 0) return false;
  const shape = planShape(input.rawToolCalls);
  return shape.hasSendReply && !shape.hasAction && !shape.hasAskOperator && !shape.hasEscalation;
}

export interface RoutePlanInput {
  ctx: AgentContext;
  instruction: string;
  rawToolCalls: readonly RawToolCall[];
  readBlocks: readonly Anthropic.ToolUseBlock[];
  readStatusMap: ReadonlyMap<string, ToolStatus>;
  readResultsMap: ReadonlyMap<string, string>;
  settings?: OrgSettings;
}

// The compensation cap reaches the planner as prompt text, and a prompt is not an
// enforcement point — the model has planned an over-cap refund while asserting in
// the same plan that it was within cap. static-policy blocks the execution; this
// makes the plan route to a human instead of arriving as a reviewable card. Reads
// the same `refundAmountLimits` marker static-policy does, so the set of capped
// tools stays declared in one place.
function planExceedsCompensationCap(
  rawToolCalls: readonly RawToolCall[],
  settings: OrgSettings | undefined,
): boolean {
  const cap = settings?.maxRefundAmount;
  if (cap === null || cap === undefined || cap <= 0) return false;
  return rawToolCalls.some((toolCall) => {
    if (!getToolDefinition(toolCall.name)?.policy.refundAmountLimits) return false;
    const amount = Number((toolCall.input as { amount?: unknown })?.amount);
    return Number.isFinite(amount) && amount > cap;
  });
}

// Deterministic structural escalations: they compare the requested operation,
// plan reads, and known order/customer state. Lifted out of the old
// shouldForcePlanningEscalation (the fraud/injection/contradiction/out-of-scope
// branches now come from the classifier/regex intent routing instead).
function structuralEscalationSignal(input: RoutePlanInput): string | null {
  const { ctx, instruction } = input;
  if (shouldEscalateFulfilledCancelRequest(ctx, instruction)) return "fulfilled_cancel";
  if (shouldEscalateFulfilledAddressChangeRequest(ctx, instruction)) return "fulfilled_address_change";
  // The model sometimes notices the prior refund but drafts a holding reply
  // instead of the escalation the compensation policy requires. The refund
  // call is stripped before routing, so make the order state itself decisive;
  // otherwise the classifier sees only a generic mutative reply and parks it as
  // needs_review without the explicit handoff promised by the policy.
  if (refundTargetsAlreadyFullyRefunded(ctx, instruction)) return "already_refunded";
  if (refundTargetsNonPaidOrder(ctx, instruction, input.rawToolCalls)) return "non_paid_refund";
  if (planExceedsCompensationCap(input.rawToolCalls, input.settings)) return "over_compensation_cap";
  const shape = planShape(input.rawToolCalls);
  // Compensation policy already says vague amounts, missing identity, prior
  // refunds, mismatched balances, and every other unfulfilled money request go
  // to a human. Enforce the terminal shape after planning so a model that emits
  // only a holding reply cannot turn that hard rule into a soft review card.
  // Any real action (including an exchange chosen from "refund or exchange")
  // remains model-elected and continues through ordinary policy checks.
  if (!shape.hasAction && !shape.hasEscalation && hasExplicitCompensationRequest(ctx)) {
    return "compensation_exception";
  }
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

  const shape = planShape(rawToolCalls);
  if (
    !isMerchantAnswerPlanningInstruction(instruction)
    && planSearchedKbWithNoResults(input)
    && shape.hasSendReply
    && !shape.hasAction
    && !shape.hasAskOperator
    && !shape.hasEscalation
    && !isRoutineOrderStatusReply(input)
  ) {
    if (!signals.includes("kb_miss")) signals.push("kb_miss");
    needsReview = true;
  }

  const question = signals.includes("policy_question") || signals.includes("kb_miss")
    ? buildMerchantRoutingQuestion(ctx)
    : null;

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
//
// `keepReply` is the guest-storefront exception, and only that. Dropping the
// reply is right for support — escalating a refund dispute should not also fire
// off a message that pre-empts the human who is about to handle it. It is wrong
// for a shopper sitting in front of an open chat window, where an escalation is
// invisible and a deleted reply is indistinguishable from the widget being
// broken. On that channel escalation is the normal terminal state for the most
// common question, so the reply goes out and the thread still lands on the
// merchant.
export function applyEscalationRouting(
  rawToolCalls: readonly RawToolCall[],
  reason: string,
  options?: { keepReply?: boolean },
): RawToolCall[] {
  const kept = rawToolCalls.filter(
    (toolCall) =>
      TOOL_CATEGORIES[toolCall.name] === "read" ||
      (options?.keepReply === true && toolCall.name === "send_reply"),
  );
  const existing = rawToolCalls.find((toolCall) => toolCall.name === "escalate_to_human");
  if (existing) return [...kept, existing];
  return [
    ...kept,
    { id: "tu_route_escalate", name: "escalate_to_human", input: { reason } },
  ];
}

// A plan is a proposal — planAgent runs no tools — so at plan time nothing the
// agent could have done has happened yet. An escalation reason asserting a
// completed mutation is therefore describing something that does not exist: the
// 2026-08-19 storefront run put "a return has been initiated" on the merchant's
// phone for a plan whose only calls were reads. The operator card renders this
// sentence verbatim as the most useful line in the notification, so it has to be
// one the plan can account for.
//
// Grounding is deliberately narrow. The claim is dropped only when the plan holds
// no action-category call at all, which makes it unambiguously unsupported; a plan
// that does propose the matching action is at worst premature, and the card lists
// those steps separately. Claims the model attributes to the customer are left
// alone — "customer says they already returned it" reports what someone else did.
const MUTATION_SUBJECT =
  "refunds?|returns?|exchanges?|cancellations?|gift cards?|store credit|replacements?|discounts?|orders?|address(?:es)?|labels?|shipments?";

const MUTATION_VERB =
  "initiated|issued|processed|created|started|placed|sent|applied|approved|arranged|completed|refunded|returned|cancell?ed|exchanged|fulfilled|shipped|updated|changed|edited";

const MUTATION_CLAIM_PATTERNS = [
  // Agentless passive: "a return has been initiated", "the refund was processed".
  new RegExp(
    `\\b(?:${MUTATION_SUBJECT})\\b[^.!?]{0,40}?\\b(?:has|have|had|was|were)\\s+(?:already\\s+)?been\\s+(?:${MUTATION_VERB})\\b`,
    "i",
  ),
  // First person: "I've issued the refund", "we already cancelled the order".
  new RegExp(
    `\\b(?:i|we)(?:'ve|'d)?\\s+(?:have\\s+|had\\s+)?(?:already\\s+)?(?:${MUTATION_VERB})\\b[^.!?]{0,40}?\\b(?:${MUTATION_SUBJECT})\\b`,
    "i",
  ),
];

const CUSTOMER_ATTRIBUTION =
  /\b(?:customer|shopper|buyer|they|she|he)\s+(?:\w+\s+){0,2}(?:says?|said|claims?|claimed|reports?|reported|states?|stated|mentions?|mentioned|believes?|thinks?)\b|\baccording to\b/i;

export const UNGROUNDED_ESCALATION_REASON = "I couldn't complete this myself.";

export function groundEscalationReasons(
  rawToolCalls: readonly RawToolCall[],
  logContext: { orgId: string; threadId: string },
): RawToolCall[] {
  if (rawToolCalls.some((toolCall) => TOOL_CATEGORIES[toolCall.name] === "action")) {
    return [...rawToolCalls];
  }

  return rawToolCalls.map((toolCall) => {
    if (toolCall.name !== "escalate_to_human") return toolCall;
    const input = toolCall.input;
    if (!input || typeof input !== "object" || Array.isArray(input)) return toolCall;
    const reason = (input as { reason?: unknown }).reason;
    if (typeof reason !== "string" || !reason.trim()) return toolCall;

    const normalized = reason.replace(/[‘’]/g, "'");
    if (CUSTOMER_ATTRIBUTION.test(normalized)) return toolCall;
    if (!MUTATION_CLAIM_PATTERNS.some((pattern) => pattern.test(normalized))) return toolCall;

    logger.warn(
      {
        ...logContext,
        purpose: "agent_plan_ungrounded_escalation_reason",
        droppedReason: reason.trim(),
      },
      "[agent:plan] escalation reason claimed a mutation the plan never proposed",
    );
    return {
      ...toolCall,
      input: { ...(input as Record<string, unknown>), reason: UNGROUNDED_ESCALATION_REASON },
    };
  });
}

// The same invariant applied to what the customer reads. `planAgent` executes
// nothing, so at plan time a reply claiming the agent has done, is doing, or
// will do something describes an action that does not exist. The escalation
// grounding above protects a field the merchant reads on a card and can
// challenge; this one protects `send_reply.text` and `send_email.body`, which
// the customer reads with no one in between whenever the plan auto-executes.
//
// Deliberately narrower than the escalation patterns in two ways, because a
// false positive here mutilates a truthful reply to a customer:
//
//  - Agentless passive is not matched. "Your refund has been processed" is the
//    normal shape of a grounded report read out of `get_order`, not a claim the
//    agent acted.
//  - First person plural is not matched. "We shipped your order Monday" reads
//    as the store, so it can be grounded the same way; only "I" is
//    unambiguously the agent speaking about itself.
//
// What is left is the fabrication that has actually been observed: the agent
// attributing a mutation to itself that nothing in the plan performs.

const MUTATION_VERB_PROGRESSIVE =
  "initiating|issuing|processing|creating|starting|placing|sending|applying|approving|arranging|completing|refunding|returning|cancell?ing|exchanging|fulfill?ing|shipping|updating|changing|editing|opening|setting up";

const MUTATION_VERB_BASE =
  "initiate|issue|process|create|start|place|send|apply|approve|arrange|complete|refund|return|cancel|exchange|fulfill?|ship|update|change|edit|open|set up";

// `(?!\s+you\b)` keeps the communication idiom out of it: "I'll update you once
// the refund clears" promises a message, not a mutation. It does not block
// "updating your address", because `\byou\b` cannot match inside "your".
const REPLY_MUTATION_CLAIM_PATTERNS = [
  // Past: "I've issued the refund", "I already cancelled the order".
  new RegExp(
    `\\bi\\b\\s*(?:'ve|'d)?\\s*(?:have|had)?\\s*(?:just|already)?\\s*(?:${MUTATION_VERB})\\b(?!\\s+you\\b)[^.!?]{0,40}?\\b(?:${MUTATION_SUBJECT})\\b`,
    "i",
  ),
  // In progress: "I'm opening a return request for order #1024".
  new RegExp(
    `\\bi\\b\\s*(?:'m|am)\\s+(?:currently|now|already)?\\s*(?:${MUTATION_VERB_PROGRESSIVE})\\b(?!\\s+you\\b)[^.!?]{0,40}?\\b(?:${MUTATION_SUBJECT})\\b`,
    "i",
  ),
  // Promised: "I'll issue the refund", "I will cancel that order".
  new RegExp(
    `\\bi\\b\\s*(?:'ll|will)\\s+(?:go ahead and|now)?\\s*(?:${MUTATION_VERB_BASE})\\b(?!\\s+you\\b)[^.!?]{0,40}?\\b(?:${MUTATION_SUBJECT})\\b`,
    "i",
  ),
];

// Stands in only when every sentence was a fabricated claim. Honest in both
// places it can land: an escalated thread where a human follows up, and a plan
// the merchant is about to read on a card.
export const UNGROUNDED_REPLY_FALLBACK = "Let me look into this and follow up.";

const REPLY_TEXT_FIELDS: Record<string, string> = {
  send_reply: "text",
  send_email: "body",
};

// Sentence-level rather than whole-field, because a reply is usually mostly
// good — the fabricated promise is one sentence among several that answer the
// question. Split per line first so a greeting or signature on its own line
// survives a dropped sentence elsewhere.
function stripUngroundedSentences(text: string): { kept: string; dropped: string[] } {
  const dropped: string[] = [];
  const kept = text
    .split("\n")
    .map((line) => {
      const sentences = line.match(/[^.!?]+[.!?]*\s*/g);
      if (!sentences) return line;
      return sentences
        .filter((sentence) => {
          const normalized = sentence.replace(/[‘’]/g, "'");
          if (CUSTOMER_ATTRIBUTION.test(normalized)) return true;
          if (!REPLY_MUTATION_CLAIM_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
          dropped.push(sentence.trim());
          return false;
        })
        .join("");
    })
    .join("\n");
  return { kept, dropped };
}

export function groundReplyText(
  rawToolCalls: readonly RawToolCall[],
  logContext: { orgId: string; threadId: string },
): RawToolCall[] {
  if (rawToolCalls.some((toolCall) => TOOL_CATEGORIES[toolCall.name] === "action")) {
    return [...rawToolCalls];
  }

  return rawToolCalls.map((toolCall) => {
    const field = REPLY_TEXT_FIELDS[toolCall.name];
    if (!field) return toolCall;
    const input = toolCall.input;
    if (!input || typeof input !== "object" || Array.isArray(input)) return toolCall;
    const text = (input as Record<string, unknown>)[field];
    if (typeof text !== "string" || !text.trim()) return toolCall;

    const { kept, dropped } = stripUngroundedSentences(text);
    if (dropped.length === 0) return toolCall;

    logger.warn(
      {
        ...logContext,
        purpose: "agent_plan_ungrounded_reply_text",
        tool: toolCall.name,
        droppedSentences: dropped,
      },
      "[agent:plan] reply text claimed a mutation the plan never proposed",
    );
    return {
      ...toolCall,
      input: {
        ...(input as Record<string, unknown>),
        [field]: kept.trim() || UNGROUNDED_REPLY_FALLBACK,
      },
    };
  });
}
