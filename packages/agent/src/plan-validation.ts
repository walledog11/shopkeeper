import type { AgentContext } from "./agent-context.js";
import { PLAN_SIGNAL_MESSAGES } from "./plan-signals.js";
import {
  detectUngroundedEscalationReasons,
  detectUngroundedReplyText,
} from "./plan-grounding.js";
import { shouldBlockCreateRefundForAlreadyRefundedOrder } from "./planner-safety/refunds.js";
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
}): PlanValidation {
  const { ctx, instruction, rawToolCalls } = params;
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

  const hasAction = rawToolCalls.some((toolCall) => TOOL_CATEGORIES[toolCall.name] === "action");
  if (!hasAction) {
    const orphanNote = rawToolCalls.find((toolCall) => toolCall.name === "add_internal_note");
    if (orphanNote) issues.push(issue("orphan_internal_note", orphanNote));
  }

  for (const claim of detectUngroundedEscalationReasons(rawToolCalls)) {
    issues.push(issue("ungrounded_escalation_reason", {
      id: claim.toolCallId,
      name: claim.tool,
    }));
  }
  for (const claim of detectUngroundedReplyText(rawToolCalls)) {
    issues.push(issue("ungrounded_customer_reply", {
      id: claim.toolCallId,
      name: claim.tool,
    }));
  }

  return issues.length > 0
    ? { status: "invalid", issues }
    : { status: "valid", issues: [] };
}

export function isInvalidPlan(
  plan: { validation?: PlanValidation } | null | undefined,
): boolean {
  return plan?.validation?.status === "invalid";
}
