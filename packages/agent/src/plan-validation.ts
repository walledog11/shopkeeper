import type { AgentContext } from "./agent-context.js";
import { PLAN_SIGNAL_MESSAGES } from "./plan-signals.js";
import {
  detectUngroundedEscalationReasons,
  detectUngroundedReplyText,
} from "./plan-grounding.js";
import { shouldBlockCreateRefundForAlreadyRefundedOrder } from "./planner-safety/refunds.js";
import { customerMessageCallCount } from "./proposal-communication.js";
import { bindReplyPlaceholders, hasReplyPlaceholders } from "./reply-placeholders.js";
import { TOOL_CATEGORIES, parseToolInput } from "./tools/registry/index.js";
import type {
  PlanValidation,
  PlanValidationIssue,
  PlanValidationIssueCode,
  RawToolCall,
} from "./types.js";

function issue(
  code: PlanValidationIssueCode,
  toolCall?: Pick<RawToolCall, "id" | "name">,
): PlanValidationIssue {
  return {
    code,
    message: PLAN_SIGNAL_MESSAGES[code],
    ...(toolCall ? { toolCallId: toolCall.id, tool: toolCall.name } : {}),
  };
}

/** Validates the captured model proposal once, without normalizing or editing it. */
export function validatePlan(params: {
  ctx: AgentContext;
  instruction: string;
  rawToolCalls: readonly RawToolCall[];
  readResults?: Readonly<Record<string, string>>;
  /**
   * Set when the plan binds its customer message into the proposal as one exact
   * draft. Two messages cannot be one draft, and approving one of them must not
   * send the other.
   */
  singleCustomerMessage?: boolean;
}): PlanValidation {
  const { ctx, instruction, rawToolCalls, readResults } = params;
  const issues: PlanValidationIssue[] = [];
  const seenIds = new Set<string>();

  for (const toolCall of rawToolCalls) {
    if (seenIds.has(toolCall.id)) {
      issues.push(issue("duplicate_tool_call_id", toolCall));
    } else {
      seenIds.add(toolCall.id);
    }

    try {
      parseToolInput(toolCall.name, toolCall.input);
    } catch {
      issues.push(issue("invalid_tool_input", toolCall));
    }
  }

  if (
    rawToolCalls.some((toolCall) => toolCall.name === "create_refund")
    && shouldBlockCreateRefundForAlreadyRefundedOrder(ctx, instruction, rawToolCalls)
  ) {
    const refund = rawToolCalls.find((toolCall) => toolCall.name === "create_refund");
    issues.push(issue("already_refunded_action", refund));
  }

  if (params.singleCustomerMessage && customerMessageCallCount(rawToolCalls) > 1) {
    const second = rawToolCalls.filter((toolCall) => (
      toolCall.name === "send_reply" || toolCall.name === "send_email"
    ))[1];
    issues.push(issue("multiple_customer_messages", second));
  }

  // Only an exact draft fills placeholders; any other plan would send the
  // token itself. On an exact draft each one must name exactly one approved
  // call that can fill it.
  for (const toolCall of rawToolCalls) {
    const draft = customerDraft(toolCall);
    if (!draft) continue;
    const unfillable = params.singleCustomerMessage
      ? bindReplyPlaceholders(draft, rawToolCalls).unbound.length > 0
      : hasReplyPlaceholders(draft);
    if (unfillable) issues.push(issue("unbound_reply_placeholder", toolCall));
  }

  const hasAction = rawToolCalls.some((toolCall) => TOOL_CATEGORIES[toolCall.name] === "action");
  if (!hasAction) {
    const orphanNote = rawToolCalls.find((toolCall) => toolCall.name === "add_internal_note");
    if (orphanNote) issues.push(issue("orphan_internal_note", orphanNote));
  }

  for (const claim of detectUngroundedEscalationReasons(rawToolCalls, { ctx, readResults })) {
    issues.push(issue("ungrounded_escalation_reason", {
      id: claim.toolCallId,
      name: claim.tool,
    }));
  }
  for (const claim of detectUngroundedReplyText(rawToolCalls, { ctx, readResults })) {
    issues.push(issue("ungrounded_customer_reply", {
      id: claim.toolCallId,
      name: claim.tool,
    }));
  }

  return issues.length > 0
    ? { status: "invalid", issues }
    : { status: "valid", issues: [] };
}

function customerDraft(toolCall: RawToolCall): string | null {
  if (!toolCall.input || typeof toolCall.input !== "object") return null;
  const input = toolCall.input as Record<string, unknown>;
  const draft = toolCall.name === "send_reply" ? input.text
    : toolCall.name === "send_email" ? input.body
    : null;
  return typeof draft === "string" ? draft : null;
}

export function isInvalidPlan(
  plan: { validation?: PlanValidation } | null | undefined,
): boolean {
  return plan?.validation?.status === "invalid";
}
