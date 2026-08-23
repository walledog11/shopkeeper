import { isQuestionableSender } from "./sender-trust.js";
import {
  resolveAgentSettings,
  resolveAutoExecuteMode,
  TIERS_THAT_AUTO_EXECUTE,
} from "./settings.js";
import { planSignals } from "./plan-signals.js";
import { checkStaticToolPolicy } from "./tools/static-policy.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import type {
  AgentPlan,
  ClassifierAlignmentState,
  OrgSettings,
  PlanRoutingEvidence,
  PlanRoutingEvidenceCode,
  PlanSignalCode,
  PlanValidationIssue,
  ProducedPlanSignalCode,
  RawToolCall,
} from "./types.js";

export type AutonomyKind =
  | "invalid"
  | "escalate"
  | "needs_merchant_input"
  | "needs_review"
  | "quick_reply"
  | "auto_execute";

export type AutonomyReasonCode =
  | PlanRoutingEvidenceCode
  | ProducedPlanSignalCode
  | "legacy_warning"
  | "questionable_sender"
  | "thread_already_escalated"
  | "auto_execute_rollout_disabled"
  | "outside_business_hours"
  | "static_policy_block"
  | "tier_requires_review"
  | "missing_customer_reply"
  | "safe_quick_reply"
  | "review_fallback"
  | "explicit_escalation"
  | "explicit_merchant_question";

export interface AutonomyContext {
  filterStatus?: string | null
  threadEscalated?: boolean
  allowMutativeAutoExecute?: boolean
  classifierState?: ClassifierAlignmentState
}

interface VerdictBase {
  kind: AutonomyKind
  reasons: AutonomyReasonCode[]
}

export type AutonomyVerdict =
  | (VerdictBase & { kind: "invalid"; issues: PlanValidationIssue[] })
  | (VerdictBase & {
      kind: "escalate"
      escalationReason: string | null
      toolCalls: RawToolCall[]
    })
  | (VerdictBase & { kind: "needs_merchant_input"; question: string | null })
  | (VerdictBase & {
      kind: "needs_review"
      approvalAllowed: boolean
      toolCalls: RawToolCall[]
    })
  | (VerdictBase & {
      kind: "quick_reply"
      toolCalls: RawToolCall[]
      replyText: string
      sendReplyToolCall: RawToolCall
    })
  | (VerdictBase & {
      kind: "auto_execute"
      toolCalls: RawToolCall[]
      replyText: string
      sendReplyToolCall: RawToolCall
    });

const QUICK_REPLY_READ_TOOLS = new Set([
  "search_kb",
  "search_shopify_products",
  "search_shopify_customers",
  "get_shopify_customer",
  "get_shopify_orders",
  "get_order_by_name",
  "get_order_tracking",
]);

const EXECUTABLE_CATEGORIES = new Set(["action", "communication", "internal"]);

const ESCALATION_EVIDENCE = new Set<PlanRoutingEvidenceCode>([
  "fraud_risk",
  "forwarded_prompt_injection",
  "contradictory_request",
  "out_of_scope_commercial_request",
  "fulfilled_cancellation_request",
  "fulfilled_address_change_request",
  "already_refunded_request",
  "non_paid_refund_request",
  "compensation_exception",
  "ambiguous_customer",
  "critical_planning_read_failure",
  "compensation_over_cap",
]);

function replyText(toolCall: RawToolCall | null): string | null {
  const input = toolCall?.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const text = (input as { text?: unknown }).text;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

function questionText(toolCall: RawToolCall | null): string | null {
  const input = toolCall?.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const question = (input as { question?: unknown }).question;
  return typeof question === "string" && question.trim() ? question.trim() : null;
}

function escalationText(toolCall: RawToolCall | null): string | null {
  const input = toolCall?.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const reason = (input as { reason?: unknown }).reason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

function executableCalls(plan: AgentPlan): RawToolCall[] {
  return plan.rawToolCalls.filter((toolCall) => {
    const category = TOOL_CATEGORIES[toolCall.name];
    return Boolean(category && EXECUTABLE_CATEGORIES.has(category));
  });
}

function routingEvidence(plan: AgentPlan, context: AutonomyContext): PlanRoutingEvidence {
  if (plan.routingEvidence) return plan.routingEvidence;
  // Read-only compatibility for v1-v6 cache records. Current v7 writers strip
  // `routing`, and legacy versions are never current/executable.
  if (plan.routing) {
    return {
      classifierState: context.classifierState ?? "not_applicable",
      codes: [],
      question: plan.routing.question ?? null,
    };
  }
  const classifierState = context.classifierState ?? "not_applicable";
  return { classifierState, codes: [] };
}

function signalReason(code: PlanSignalCode): AutonomyReasonCode {
  return code;
}

export function decideAutonomy(
  plan: AgentPlan,
  settings?: Partial<OrgSettings> | OrgSettings | null,
  context: AutonomyContext = {},
): AutonomyVerdict {
  if (plan.validation?.status === "invalid") {
    return {
      kind: "invalid",
      reasons: plan.validation.issues.map((issue) => issue.code),
      issues: plan.validation.issues,
    };
  }

  const evidence = routingEvidence(plan, context);
  const calls = executableCalls(plan);
  const resolved = resolveAgentSettings(settings ?? null);
  const staticPolicyBlocked = calls.some(
    (call) => checkStaticToolPolicy(call.name, call.input, resolved).blocked,
  );
  const explicitEscalation = plan.rawToolCalls.find((call) => call.name === "escalate_to_human") ?? null;
  const escalationCodes = evidence.codes.filter((code) => ESCALATION_EVIDENCE.has(code));
  // Structural evidence is itself the policy decision. In particular, an
  // over-cap compensation proposal must become an escalation, rather than
  // letting the same static-policy block demote it to a non-approvable card.
  // The planner materializes the safe escalation call after this verdict.
  if (escalationCodes.length > 0) {
    return {
      kind: "escalate",
      reasons: escalationCodes,
      escalationReason: evidence.escalationReason ?? escalationText(explicitEscalation),
      toolCalls: explicitEscalation ? [explicitEscalation] : [],
    };
  }
  if (explicitEscalation) {
    if (staticPolicyBlocked) {
      return {
        kind: "needs_review",
        reasons: ["static_policy_block"],
        approvalAllowed: false,
        toolCalls: calls,
      };
    }
    return {
      kind: "escalate",
      reasons: ["explicit_escalation"],
      escalationReason: escalationText(explicitEscalation),
      toolCalls: [explicitEscalation],
    };
  }

  const askOperator = plan.rawToolCalls.find((call) => call.name === "ask_operator") ?? null;
  const legacyKbGap = planSignals(plan).some((signal) => signal.code === "kb_no_match")
    && plan.rawToolCalls.some((call) => call.name === "send_reply")
    && !plan.rawToolCalls.some((call) => TOOL_CATEGORIES[call.name] === "action");
  if (askOperator || evidence.question || evidence.codes.includes("policy_gap") || evidence.codes.includes("kb_gap") || legacyKbGap) {
    return {
      kind: "needs_merchant_input",
      reasons: askOperator
        ? ["explicit_merchant_question"]
        : legacyKbGap
          ? ["kb_gap"]
          : evidence.codes.filter((code) => code === "policy_gap" || code === "kb_gap"),
      question: questionText(askOperator) ?? evidence.question ?? null,
    };
  }

  // A currently disabled executable category is never approvable, regardless
  // of which other review reason also applies. Runtime policy still rechecks
  // immediately before providers as the temporal backstop.
  if (staticPolicyBlocked) {
    return { kind: "needs_review", reasons: ["static_policy_block"], approvalAllowed: false, toolCalls: calls };
  }

  if (isQuestionableSender(context.filterStatus)) {
    return { kind: "needs_review", reasons: ["questionable_sender"], approvalAllowed: true, toolCalls: calls };
  }

  if (context.threadEscalated) {
    return { kind: "needs_review", reasons: ["thread_already_escalated"], approvalAllowed: true, toolCalls: calls };
  }

  if (evidence.classifierState === "missing" || evidence.codes.includes("classifier_unavailable")) {
    return { kind: "needs_review", reasons: ["classifier_unavailable"], approvalAllowed: true, toolCalls: calls };
  }
  if (evidence.classifierState === "unaligned" || evidence.codes.includes("classifier_unaligned")) {
    return { kind: "needs_review", reasons: ["classifier_unaligned"], approvalAllowed: true, toolCalls: calls };
  }

  const blockingSignals = planSignals(plan).filter((signal) => signal.severity === "blocking");
  if (blockingSignals.length > 0) {
    return {
      kind: "needs_review",
      reasons: blockingSignals.map((signal) => signalReason(signal.code)),
      approvalAllowed: true,
      toolCalls: calls,
    };
  }

  const mutativeCalls = plan.rawToolCalls.filter((call) => TOOL_CATEGORIES[call.name] === "action");
  if (mutativeCalls.length > 0) {
    if (!TIERS_THAT_AUTO_EXECUTE.has(resolved.autonomyTier ?? "guarded")) {
      return { kind: "needs_review", reasons: ["tier_requires_review"], approvalAllowed: true, toolCalls: calls };
    }
    const sendReplyToolCall = plan.rawToolCalls.find((call) => call.name === "send_reply") ?? null;
    const text = replyText(sendReplyToolCall);
    if (!sendReplyToolCall || !text) {
      return { kind: "needs_review", reasons: ["missing_customer_reply"], approvalAllowed: false, toolCalls: calls };
    }
    if (resolveAutoExecuteMode(resolved) === "off") {
      return { kind: "needs_review", reasons: ["auto_execute_rollout_disabled"], approvalAllowed: true, toolCalls: calls };
    }
    if (context.allowMutativeAutoExecute === false) {
      return { kind: "needs_review", reasons: ["outside_business_hours"], approvalAllowed: true, toolCalls: calls };
    }
    return {
      kind: "auto_execute",
      reasons: [],
      toolCalls: calls,
      replyText: text,
      sendReplyToolCall,
    };
  }

  if (plan.steps.length === 1 && plan.steps[0]?.tool === "send_reply") {
    const sendReplyCalls = plan.rawToolCalls.filter((call) => call.name === "send_reply");
    const sendReplyToolCall = sendReplyCalls[0] ?? null;
    const safeShape = sendReplyCalls.length === 1
      && sendReplyToolCall?.id === plan.steps[0].id
      && plan.rawToolCalls.every((call) => (
        call.id === sendReplyToolCall.id ? call.name === "send_reply" : QUICK_REPLY_READ_TOOLS.has(call.name)
      ));
    const text = replyText(sendReplyToolCall);
    if (safeShape && text && resolved.autonomyTier !== "watch" && resolved.toolsEnabled.communication !== false) {
      return {
        kind: "quick_reply",
        reasons: ["safe_quick_reply"],
        toolCalls: [sendReplyToolCall],
        replyText: text,
        sendReplyToolCall,
      };
    }
  }

  return { kind: "needs_review", reasons: ["review_fallback"], approvalAllowed: true, toolCalls: calls };
}

export type {
  ClassifierAlignmentState,
  PlanRoutingEvidence,
  PlanRoutingEvidenceCode,
} from "./types.js";
