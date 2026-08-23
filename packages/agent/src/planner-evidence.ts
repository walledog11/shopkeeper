import type Anthropic from "@anthropic-ai/sdk";
import type { AgentContext } from "./agent-context.js";
import { customerMessageTexts, hasActionableMutativeIntent } from "./intent.js";
import { isMerchantAnswerPlanningInstruction } from "./kb-learned.js";
import { merchantRoutingQuestionFromCustomerMessage } from "./plan-preview.js";
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
import type {
  ClassifierAlignmentState,
  OrgSettings,
  PlanRoutingEvidence,
  PlanRoutingEvidenceCode,
  ProducedPlanSignalCode,
  RawToolCall,
} from "./types.js";

export interface BuildPlanRoutingEvidenceInput {
  ctx: AgentContext;
  instruction: string;
  rawToolCalls: readonly RawToolCall[];
  readBlocks: readonly Anthropic.ToolUseBlock[];
  readStatusMap: ReadonlyMap<string, ToolStatus>;
  readResultsMap: ReadonlyMap<string, string>;
  settings?: OrgSettings;
}

export interface BuiltPlanRoutingEvidence {
  evidence: PlanRoutingEvidence;
  signalCodes: ProducedPlanSignalCode[];
}

const ESCALATION_REASONS: Record<PlanRoutingEvidenceCode, string | undefined> = {
  classifier_unavailable: undefined,
  classifier_unaligned: undefined,
  fraud_risk: "Possible fraud signals (chargeback, alternate-card refund, or urgent non-receipt) — needs human review.",
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
  if (!ctx.classifierSignals) return "missing";
  const source = ctx.thread.requestSourceMessageId;
  const latest = ctx.thread.latestCustomerMessageId;
  // Hand-built contexts in package tests and non-host modules predate alignment
  // metadata. Production buildContext always supplies both fields.
  if (source === undefined && latest === undefined) return "aligned";
  return source && latest && source === latest ? "aligned" : "unaligned";
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
    const amount = Number((toolCall.input as { amount?: unknown })?.amount);
    return Number.isFinite(amount) && amount > cap;
  });
}

function hasExplicitCompensationRequest(ctx: AgentContext): boolean {
  if (!ctx.classifierSignals?.intents.mutative_request) return false;
  if (ctx.classifierSignals.intents.policy_question) return false;
  return customerMessageTexts(ctx).some((text) => {
    const lower = text.toLowerCase();
    return /\brefund(?:ed|ing|s)?\b/.test(lower)
      || /\b(?:send|give|issue|create|provide)\b[^.?!]{0,48}\b(?:gift card|store credit)\b/.test(lower)
      || /\bcredit\s+(?:my|the|this)\s+account\b/.test(lower);
  });
}

function escalationCode(input: BuildPlanRoutingEvidenceInput): PlanRoutingEvidenceCode | null {
  const { ctx, instruction, rawToolCalls } = input;
  if (shouldEscalateFulfilledCancelRequest(ctx, instruction)) return "fulfilled_cancellation_request";
  if (shouldEscalateFulfilledAddressChangeRequest(ctx, instruction)) return "fulfilled_address_change_request";
  if (refundTargetsAlreadyFullyRefunded(ctx, instruction)) return "already_refunded_request";
  if (refundTargetsNonPaidOrder(ctx, instruction, rawToolCalls)) return "non_paid_refund_request";
  if (planExceedsCompensationCap(rawToolCalls, input.settings)) return "compensation_over_cap";
  const shape = planShape(rawToolCalls);
  if (!shape.hasAction && !shape.hasEscalation && hasExplicitCompensationRequest(ctx)) {
    return "compensation_exception";
  }
  if (hasAmbiguousCustomerSearchResult(input.readBlocks, input.readResultsMap)) return "ambiguous_customer";
  if (hasCriticalPlanningReadErrorsForBlocks(input.readBlocks, input.readStatusMap)) {
    if (hasActionableMutativeIntent(...customerMessageTexts(ctx)) || ctx.recentOrders.length === 0) {
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

function kbMissNeedsMerchant(input: BuildPlanRoutingEvidenceInput): boolean {
  if (isMerchantAnswerPlanningInstruction(input.instruction)) return false;
  const searchedAndMissed = input.readBlocks.some(
    (block) => block.name === "search_kb" && input.readStatusMap.get(block.id) === "not_found",
  );
  if (!searchedAndMissed) return false;
  const shape = planShape(input.rawToolCalls);
  const routineOrderStatus = Boolean(
    input.ctx.classifierSignals?.intents.order_status
    && input.ctx.recentOrders.length > 0
    && shape.hasSendReply
    && !shape.hasAction
    && !shape.hasAskOperator
    && !shape.hasEscalation,
  );
  return !routineOrderStatus
    && shape.hasSendReply
    && !shape.hasAction
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
    && input.ctx.classifierSignals?.intents.mutative_request
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
  const customerTexts = customerMessageTexts(input.ctx);
  return {
    evidence: {
      classifierState: state,
      codes: uniqueCodes,
      ...(escalationReasons.length > 0 ? { escalationReason: escalationReasons.join(" ") } : {}),
      ...(needsQuestion
        ? { question: merchantRoutingQuestionFromCustomerMessage(customerTexts[customerTexts.length - 1]) }
        : {}),
    },
    signalCodes: [...new Set(signalCodes)],
  };
}
