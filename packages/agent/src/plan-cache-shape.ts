import { SENDER_TYPE } from "./thread-constants.js"
import type { AgentPlan, ClassifierAlignmentState, PlanRoutingEvidence, PlanRoutingEvidenceCode, PlanSignal, PlanStep, PlanValidation, PlanValidationIssue, PlanValidationIssueCode, RawToolCall, ToolCategory } from "./types.js"
import { isRecord } from "./guards.js"
export type PlanThreadMessage = {
  id: string
  senderType: string
}

export const AGENT_PLAN_CACHE_VERSION = 7
export const SUPPORTED_AGENT_PLAN_CACHE_VERSIONS = [1, 2, 3, 4, 5, 6, AGENT_PLAN_CACHE_VERSION]

export interface AgentPlanCacheRecordShape {
  version: number
  planId: string | null
  instruction: string
  lastCustomerMessageId: string | null
  settingsFingerprint: string
  plan: AgentPlan
}

const TOOL_CATEGORIES: ToolCategory[] = ["action", "communication", "internal", "read"]
const PLAN_VALIDATION_ISSUE_CODES: PlanValidationIssueCode[] = [
  "invalid_tool_input",
  "duplicate_tool_call_id",
  "already_refunded_action",
  "orphan_internal_note",
  "ungrounded_escalation_reason",
  "ungrounded_customer_reply",
]
const CLASSIFIER_ALIGNMENT_STATES: ClassifierAlignmentState[] = ["aligned", "missing", "unaligned", "not_applicable"]
const PLAN_ROUTING_EVIDENCE_CODES: PlanRoutingEvidenceCode[] = [
  "classifier_unavailable",
  "classifier_unaligned",
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
  "policy_gap",
  "kb_gap",
  "circular_channel_deflection",
]


function isToolCategory(value: unknown): value is ToolCategory {
  return typeof value === "string" && TOOL_CATEGORIES.includes(value as ToolCategory)
}

function isPlanStep(value: unknown): value is PlanStep {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.tool === "string" &&
    typeof value.label === "string" &&
    typeof value.description === "string" &&
    isToolCategory(value.category) &&
    typeof value.enabled === "boolean"
  )
}

function isRawToolCall(value: unknown): value is RawToolCall {
  if (!isRecord(value)) return false
  return typeof value.id === "string" && typeof value.name === "string" && "input" in value
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(v => typeof v === "string")
}

function isPlanSignal(value: unknown): value is PlanSignal {
  if (!isRecord(value)) return false
  return (
    typeof value.code === "string" &&
    (value.severity === "blocking" || value.severity === "advisory") &&
    typeof value.message === "string"
  )
}

function isPlanValidationIssue(value: unknown): value is PlanValidationIssue {
  if (!isRecord(value)) return false
  return (
    typeof value.code === "string"
    && PLAN_VALIDATION_ISSUE_CODES.includes(value.code as PlanValidationIssueCode)
    && typeof value.message === "string"
    && (value.toolCallId === undefined || typeof value.toolCallId === "string")
    && (value.tool === undefined || typeof value.tool === "string")
  )
}

function isPlanValidation(value: unknown): value is PlanValidation {
  if (!isRecord(value) || !Array.isArray(value.issues)) return false
  if (value.status === "valid") return value.issues.length === 0
  return value.status === "invalid"
    && value.issues.length > 0
    && value.issues.every(isPlanValidationIssue)
}

function isPlanRoutingEvidence(value: unknown): value is PlanRoutingEvidence {
  if (!isRecord(value)) return false
  return (
    typeof value.classifierState === "string"
    && CLASSIFIER_ALIGNMENT_STATES.includes(value.classifierState as ClassifierAlignmentState)
    && Array.isArray(value.codes)
    && value.codes.every((code) => (
      typeof code === "string" && PLAN_ROUTING_EVIDENCE_CODES.includes(code as PlanRoutingEvidenceCode)
    ))
    && (value.question === undefined || value.question === null || typeof value.question === "string")
    && (value.escalationReason === undefined || value.escalationReason === null || typeof value.escalationReason === "string")
  )
}

function isAgentPlan(value: unknown, requireCurrentFields: boolean): value is AgentPlan {
  if (!isRecord(value)) return false
  if (typeof value.instruction !== "string") return false
  if (!Array.isArray(value.steps) || !value.steps.every(isPlanStep)) return false
  if (!Array.isArray(value.rawToolCalls) || !value.rawToolCalls.every(isRawToolCall)) return false
  if (value.readResults !== undefined && !isStringRecord(value.readResults)) return false
  if (value.warnings !== undefined && (!Array.isArray(value.warnings) || !value.warnings.every(w => typeof w === "string"))) return false
  if (value.signals !== undefined && (!Array.isArray(value.signals) || !value.signals.every(isPlanSignal))) return false
  if (requireCurrentFields && !isPlanValidation(value.validation)) return false
  if (value.validation !== undefined && !isPlanValidation(value.validation)) return false
  if (requireCurrentFields && !isPlanRoutingEvidence(value.routingEvidence)) return false
  if (value.routingEvidence !== undefined && !isPlanRoutingEvidence(value.routingEvidence)) return false
  if (value.namespaceMiss !== undefined && typeof value.namespaceMiss !== "boolean") return false
  if (value.routing !== undefined) {
    if (!isRecord(value.routing)) return false
    const { decision, signals, question } = value.routing
    if (decision !== "auto_execute" && decision !== "needs_review" && decision !== "escalate") return false
    if (signals !== undefined && (!Array.isArray(signals) || !signals.every(s => typeof s === "string"))) return false
    if (question !== undefined && question !== null && typeof question !== "string") return false
  }
  return true
}

export function readAgentPlanCacheRecordShape(value: unknown): AgentPlanCacheRecordShape | null {
  if (!isRecord(value)) return null
  if (
    typeof value.version !== "number" ||
    !SUPPORTED_AGENT_PLAN_CACHE_VERSIONS.includes(value.version) ||
    typeof value.instruction !== "string" ||
    typeof value.settingsFingerprint !== "string" ||
    !isAgentPlan(value.plan, value.version === AGENT_PLAN_CACHE_VERSION)
  ) {
    return null
  }

  return {
    version: value.version,
    planId: typeof value.planId === "string" && value.planId.length > 0 ? value.planId : null,
    instruction: value.instruction,
    lastCustomerMessageId: typeof value.lastCustomerMessageId === "string" ? value.lastCustomerMessageId : null,
    settingsFingerprint: value.settingsFingerprint,
    plan: value.plan,
  }
}

function readAgentPlanCachePlan(value: unknown): AgentPlan | null {
  const cached = readAgentPlanCacheRecordShape(value)
  if (!cached) return null
  return cached.planId ? { ...cached.plan, planId: cached.planId } : cached.plan
}

// The reply text the agent drafted for this thread, pulled from the cached
// plan's send_reply call. Used as the "before" side of a brand-voice edit when
// the operator sends a different reply. Returns null when no draft is cached.
export function extractCachedDraftReply(cachedPlan: unknown): string | null {
  const plan = readAgentPlanCachePlan(cachedPlan)
  if (!plan) return null
  for (const call of plan.rawToolCalls) {
    if (call.name !== "send_reply") continue
    const input = call.input
    if (isRecord(input) && typeof input.text === "string" && input.text.trim()) {
      return input.text
    }
  }
  return null
}

// The clarifying question the agent parked for the merchant, pulled from the
// cached plan's ask_operator call. Drives the `needs_merchant_input` surface.
// Returns null when no question is cached.
export function extractCachedQuestion(cachedPlan: unknown): string | null {
  const plan = readAgentPlanCachePlan(cachedPlan)
  if (!plan) return null
  for (const call of plan.rawToolCalls) {
    if (call.name !== "ask_operator") continue
    const input = call.input
    if (isRecord(input) && typeof input.question === "string" && input.question.trim()) {
      return input.question
    }
  }
  const evidenceQuestion = plan.routingEvidence?.question
  if (typeof evidenceQuestion === "string" && evidenceQuestion.trim()) return evidenceQuestion
  const routingQuestion = plan.routing?.question
  return typeof routingQuestion === "string" && routingQuestion.trim() ? routingQuestion : null
}

export function getLastConversationMessage(messages: PlanThreadMessage[]): PlanThreadMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.senderType !== SENDER_TYPE.NOTE) {
      return message
    }
  }
  return null
}

// The customer message this thread is waiting on, if any. Null once an outbound
// reply (agent/ai) is the latest non-note message.
export function getPendingCustomerMessageId(messages: PlanThreadMessage[]): string | null {
  const lastConversation = getLastConversationMessage(messages)
  if (!lastConversation || lastConversation.senderType !== SENDER_TYPE.CUSTOMER) {
    return null
  }
  return lastConversation.id
}

export function isThreadAwaitingReply(messages: PlanThreadMessage[]): boolean {
  return getPendingCustomerMessageId(messages) !== null
}

export function getCurrentPlanForThread(
  thread: { cachedPlan: unknown; cachedPlanMessageId: string | null },
  messages: PlanThreadMessage[],
): AgentPlan | null {
  const pendingCustomerMessageId = getPendingCustomerMessageId(messages)
  if (!pendingCustomerMessageId) return null
  if (!thread.cachedPlanMessageId || thread.cachedPlanMessageId !== pendingCustomerMessageId) return null
  const cache = readAgentPlanCacheRecordShape(thread.cachedPlan)
  if (!cache || cache.version !== AGENT_PLAN_CACHE_VERSION) return null
  const plan = cache.planId ? { ...cache.plan, planId: cache.planId } : cache.plan
  return plan && (plan.steps.length > 0 || plan.validation?.status === "invalid") ? plan : null
}
