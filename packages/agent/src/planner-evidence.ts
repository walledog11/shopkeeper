import type Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "./agent-context.js";
import { classifierAlignmentState } from "./classifier-signals.js";
import { currentRequestSignals } from "./planner-safety/request.js";
import { outstandingMerchantFollowUps } from "./merchant-follow-up.js";
import { merchantGapQuestion } from "./plan-preview.js";
import {
  hasAmbiguousCustomerSearchResult,
  hasCriticalPlanningReadErrorsForBlocks,
  sendReplyDeflectsToManagedChannels,
  shouldEscalateFulfilledAddressChangeRequest,
  shouldEscalateFulfilledCancelRequest,
} from "./planner-safety/index.js";
import {
  refundTargetsAlreadyFullyRefunded,
  refundTargetsNonPaidOrder,
} from "./planner-safety/refunds.js";
import { getToolDefinition, TOOL_CATEGORIES } from "./tools/registry/index.js";
import type { ToolStatus } from "./tools/result.js";
import { shopMoneyAmountOf } from "./tools/static-policy.js";
import type {
  ClassifierAlignmentState,
  MerchantContinuationKind,
  OrgSettings,
  PlanRoutingEvidence,
  PlanRoutingEvidenceCode,
  ProducedPlanSignalCode,
  RawToolCall,
} from "./types.js";

export interface BuildPlanRoutingEvidenceInput {
  ctx: AgentContext;
  rawToolCalls: readonly RawToolCall[];
  readBlocks: readonly Anthropic.ToolUseBlock[];
  readStatusMap: ReadonlyMap<string, ToolStatus>;
  readResultsMap: ReadonlyMap<string, string>;
  settings?: OrgSettings;
  withheldMessageFollowUp?: boolean;
  merchantContinuation?: MerchantContinuationKind;
}

export interface BuiltPlanRoutingEvidence {
  evidence: PlanRoutingEvidence;
  signalCodes: ProducedPlanSignalCode[];
}

const ESCALATION_REASONS: Record<PlanRoutingEvidenceCode, string | undefined> = {
  classifier_unavailable: undefined,
  classifier_unaligned: undefined,
  fraud_risk: "Possible fraud signals (chargeback/dispute language or urgent non-receipt) — needs human review.",
  forwarded_prompt_injection: "Message claims a prior authorization for a refund — needs human verification.",
  contradictory_request: "Customer made contradictory requests in one message — needs a human to clarify.",
  out_of_scope_commercial_request: "Wholesale, bulk, or B2B inquiry — out of scope for automated support.",
  fulfilled_cancellation_request: "Cancellation requested for an already-fulfilled order — needs human review.",
  fulfilled_address_change_request: "Address change requested for an already-fulfilled order — needs human review.",
  already_refunded_request: "Refund requested for an order that is already fully refunded — needs human review.",
  non_paid_refund_request: "Refund requested for an order whose payment is not in the paid state — needs human review.",
  compensation_exception: "Compensation was requested but the plan contains no safe compensation action — needs human review.",
  ambiguous_customer: "Multiple matching customers found — needs a human to confirm identity.",
  critical_planning_read_failure: "Order or customer lookup failed — could not verify details to act safely.",
  compensation_over_cap: "Compensation above the workspace limit was planned — needs human review.",
  policy_gap: undefined,
  kb_gap: undefined,
  circular_channel_deflection: undefined,
};

function classifierState(ctx: AgentContext): ClassifierAlignmentState {
  return classifierAlignmentState(
    ctx.classifierSignals, ctx.thread.requestSourceMessageId, ctx.thread.latestCustomerMessageId,
  );
}

function planShape(rawToolCalls: readonly RawToolCall[]) {
  return {
    hasEscalation: rawToolCalls.some((call) => call.name === "escalate_to_human"),
    hasAction: rawToolCalls.some((call) => TOOL_CATEGORIES[call.name] === "action"),
    hasSendReply: rawToolCalls.some((call) => call.name === "send_reply"),
    hasAskOperator: rawToolCalls.some((call) => call.name === "ask_operator"),
  };
}

function planExceedsCompensationCap(
  rawToolCalls: readonly RawToolCall[],
  settings: OrgSettings | undefined,
): boolean {
  const cap = settings?.maxRefundAmount;
  if (cap === null || cap === undefined || cap <= 0) return false;
  return rawToolCalls.some((toolCall) => {
    if (!getToolDefinition(toolCall.name)?.policy.refundAmountLimits) return false;
    const amount = Number(shopMoneyAmountOf((toolCall.input ?? {}) as Parameters<typeof shopMoneyAmountOf>[0]));
    return Number.isFinite(amount) && amount > cap;
  });
}

function hasExplicitCompensationRequest(ctx: AgentContext): boolean {
  const signals = currentRequestSignals(ctx);
  return Boolean(signals?.intents.compensation_request
    || (signals?.intents.mutative_request && !signals.intents.policy_question
      && (signals.requestFacts?.ask === "refund" || signals.requestFacts?.alternative === "refund")));
}

function requestedWriteEscalationCode(input: BuildPlanRoutingEvidenceInput): PlanRoutingEvidenceCode | null {
  const { ctx, rawToolCalls } = input;
  if (shouldEscalateFulfilledCancelRequest(ctx, rawToolCalls)) return "fulfilled_cancellation_request";
  if (shouldEscalateFulfilledAddressChangeRequest(ctx, rawToolCalls)) return "fulfilled_address_change_request";
  if (refundTargetsAlreadyFullyRefunded(ctx, rawToolCalls)) return "already_refunded_request";
  if (refundTargetsNonPaidOrder(ctx, rawToolCalls)) return "non_paid_refund_request";
  if (planExceedsCompensationCap(rawToolCalls, input.settings)) return "compensation_over_cap";
  const shape = planShape(rawToolCalls);
  if (!shape.hasAction && !shape.hasEscalation && hasExplicitCompensationRequest(ctx)) {
    return "compensation_exception";
  }
  return null;
}

function escalationCode(input: BuildPlanRoutingEvidenceInput): PlanRoutingEvidenceCode | null {
  const { ctx } = input;
  // A withheld-message follow-up is offered no write and always goes to the
  // merchant. The write its request asked for was already approved and has
  // settled, so the checks that guard that write have nothing left to guard.
  const writeCode = input.withheldMessageFollowUp ? null : requestedWriteEscalationCode(input);
  if (writeCode) return writeCode;
  if (hasAmbiguousCustomerSearchResult(input.readBlocks, input.readResultsMap)) return "ambiguous_customer";
  if (hasCriticalPlanningReadErrorsForBlocks(input.readBlocks, input.readStatusMap)) {
    const intents = currentRequestSignals(ctx)?.intents;
    if (intents?.mutative_request || intents?.compensation_request
      || input.rawToolCalls.some(call => TOOL_CATEGORIES[call.name] === "action")
      || ctx.recentOrders.length === 0) {
      return "critical_planning_read_failure";
    }
  }
  return null;
}

function classifierEscalationCodes(ctx: AgentContext): PlanRoutingEvidenceCode[] {
  const intents = ctx.classifierSignals?.intents;
  if (!intents) return [];
  const codes: PlanRoutingEvidenceCode[] = [];
  if (intents.fraud_signals) codes.push("fraud_risk");
  if (intents.forwarded_injection) codes.push("forwarded_prompt_injection");
  if (intents.contradiction) codes.push("contradictory_request");
  if (intents.out_of_scope_commercial) codes.push("out_of_scope_commercial_request");
  return codes;
}

type KbMissInput = Pick<
  BuildPlanRoutingEvidenceInput,
  "ctx" | "merchantContinuation" | "rawToolCalls" | "readBlocks" | "readStatusMap"
>;

function missedKbQueries(input: Pick<KbMissInput, "readBlocks" | "readStatusMap">): string[] {
  return input.readBlocks
    .filter((block) => block.name === "search_kb" && input.readStatusMap.get(block.id) === "not_found")
    .map((block) => (block.input as { query?: unknown } | null)?.query)
    .filter((query): query is string => typeof query === "string");
}

function searchedAndMissed(input: Pick<KbMissInput, "readBlocks" | "readStatusMap">): boolean {
  return input.readBlocks.some(
    (block) => block.name === "search_kb" && input.readStatusMap.get(block.id) === "not_found",
  );
}

// A return Shopkeeper opens but cannot send a label for is the whole plan once
// the agent has nothing from the store on how items go back: the knowledge base
// came up empty, it is about to ask the merchant, or the model deliberately ends
// with the action alone. The merchant is told to
// send the label instead, so the planning loop ends the turn at the return. A
// plan the merchant directed (their instruction, answer or revision) is exempt:
// what they typed may be exactly the reply they want sent.
export function completesAtMerchantFollowUp(
  input: Pick<KbMissInput, "rawToolCalls" | "readBlocks" | "readStatusMap"> & {
    merchantDirected: boolean;
    modelEndedTurn?: boolean;
  },
): boolean {
  if (input.merchantDirected) return false;
  const names = input.rawToolCalls.map((call) => call.name);
  if (outstandingMerchantFollowUps(names).length === 0) return false;
  return input.modelEndedTurn === true || searchedAndMissed(input) || names.includes("ask_operator");
}

// A customer reply drafted after the knowledge base came up empty. The planning
// loop refuses the reply while the turn is still open so the model asks the
// merchant instead, and routing treats a reply that got through anyway as a gap.
// A reply beside an action usually just reports that action, so it is held only
// when the customer also asked about store policy: opening a return does not
// tell anyone how this store takes items back.
export function kbMissNeedsMerchant(input: KbMissInput): boolean {
  if (input.merchantContinuation === "answer") return false;
  if (!searchedAndMissed(input)) return false;
  const shape = planShape(input.rawToolCalls);
  const routineOrderStatus = Boolean(
    input.ctx.classifierSignals?.intents.order_status
    && input.ctx.recentOrders.length > 0
    && shape.hasSendReply
    && !shape.hasAction
    && !shape.hasAskOperator
    && !shape.hasEscalation,
  );
  const askedPolicy = classifierState(input.ctx) === "aligned"
    && Boolean(input.ctx.classifierSignals?.intents.policy_question);
  return !routineOrderStatus
    && shape.hasSendReply
    && (!shape.hasAction || askedPolicy)
    && !shape.hasAskOperator
    && !shape.hasEscalation;
}

export function buildPlanRoutingEvidence(
  input: BuildPlanRoutingEvidenceInput,
): BuiltPlanRoutingEvidence {
  const state = classifierState(input.ctx);
  const codes: PlanRoutingEvidenceCode[] = [];
  const signalCodes: ProducedPlanSignalCode[] = [];
  if (state === "missing") codes.push("classifier_unavailable");
  if (state === "unaligned") codes.push("classifier_unaligned");

  const structural = escalationCode(input);
  if (structural) codes.push(structural);
  if (state === "aligned") codes.push(...classifierEscalationCodes(input.ctx));

  const shape = planShape(input.rawToolCalls);
  if (
    state === "aligned"
    && (input.ctx.classifierSignals?.intents.mutative_request || input.ctx.classifierSignals?.intents.compensation_request)
    && !shape.hasAction
    && !shape.hasEscalation
  ) {
    signalCodes.push("mutative_intent_no_action");
  }
  if (
    state === "aligned"
    && input.ctx.classifierSignals?.intents.policy_question
    && !shape.hasSendReply
    && !shape.hasAskOperator
    && !shape.hasEscalation
    // A plan that leaves the rest to the merchant, such as sending a return
    // label, is answered by that follow-up rather than missing an answer.
    && outstandingMerchantFollowUps(input.rawToolCalls.map((call) => call.name)).length === 0
  ) {
    codes.push("policy_gap");
  }
  if (input.rawToolCalls.some(sendReplyDeflectsToManagedChannels)) {
    codes.push("circular_channel_deflection");
    signalCodes.push("circular_channel_deflection");
  }
  if (kbMissNeedsMerchant(input)) codes.push("kb_gap");

  const uniqueCodes = [...new Set(codes)];
  const escalationReasons = uniqueCodes
    .map((code) => ESCALATION_REASONS[code])
    .filter((reason): reason is string => Boolean(reason));
  const needsQuestion = uniqueCodes.includes("policy_gap") || uniqueCodes.includes("kb_gap");
  return {
    evidence: {
      classifierState: state,
      codes: uniqueCodes,
      ...(escalationReasons.length > 0 ? { escalationReason: escalationReasons.join(" ") } : {}),
      ...(needsQuestion
        ? { question: merchantGapQuestion(uniqueCodes.includes("kb_gap") ? missedKbQueries(input) : []) }
        : {}),
    },
    signalCodes: [...new Set(signalCodes)],
  };
}
