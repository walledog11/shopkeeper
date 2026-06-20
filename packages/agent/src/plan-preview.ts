import type { AgentPlan, OrgSettings, PlanStep, RawToolCall } from "./types.js"
import { resolveAgentSettings, TIERS_THAT_AUTO_EXECUTE, type AutonomyTier } from "./settings.js"
import { isQuestionableSender } from "./sender-trust.js"
import { TOOL_CATEGORIES } from "./tools/registry/index.js"
import { checkStaticToolPolicy } from "./tools/static-policy.js"

export type HomePlanKind = "quick_reply" | "needs_review" | "auto_execute" | "needs_merchant_input"

export interface HomePlanClassification {
  kind: HomePlanKind
  replyText: string | null
  sendReplyToolCall: RawToolCall | null
  // Set only for `needs_merchant_input` — the clarifying question for the merchant.
  question: string | null
}

const QUICK_REPLY_READ_TOOLS = new Set([
  "search_kb",
  "search_shopify_products",
  "search_shopify_customers",
  "get_shopify_customer",
  "get_shopify_orders",
  "get_order_by_name",
  "get_order_tracking",
])

const CUSTOMER_OR_ORDER_READ_TOOLS = new Set([
  "search_shopify_customers",
  "get_shopify_customer",
  "get_shopify_orders",
  "get_order_by_name",
  "get_order_tracking",
])

const ACTION_TOOL_PRIORITY = [
  "create_refund",
  "cancel_order",
  "edit_shopify_order",
  "create_shopify_order",
  "update_shopify_order_address",
  "update_shopify_customer_info",
  "add_shopify_customer_note",
]

const TOOL_PHRASE: Record<string, string> = {
  send_reply: "reply",
  send_email: "email customer",
  add_internal_note: "add internal note",
  update_thread_status: "close ticket",
  update_thread_tag: "retag",
}

export interface PlanPreview {
  headline: string
  context: string
  proposal: string
  actionText: string | null
  orderRef: string | null
}

const REPLY_TOOL_NAMES = ["send_reply", "send_email"]

function replyTextFromToolCall(toolCall: RawToolCall | null): string | null {
  const input = toolCall?.input
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const text = (input as { text?: unknown }).text
  return typeof text === "string" && text.trim() ? text.trim() : null
}

function questionFromToolCall(toolCall: RawToolCall | null): string | null {
  const input = toolCall?.input
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const question = (input as { question?: unknown }).question
  return typeof question === "string" && question.trim() ? question.trim() : null
}

export function planReplyText(plan: AgentPlan | null): string | null {
  if (!plan) return null
  for (const name of REPLY_TOOL_NAMES) {
    const text = replyTextFromToolCall(plan.rawToolCalls.find(toolCall => toolCall.name === name) ?? null)
    if (text) return text
  }
  return null
}

function usesCustomerOrOrderContext(plan: AgentPlan): boolean {
  return plan.rawToolCalls.some(toolCall => CUSTOMER_OR_ORDER_READ_TOOLS.has(toolCall.name))
}

function warningBlocksQuickReply(warning: string, plan: AgentPlan): boolean {
  const lower = warning.toLowerCase()

  if (lower.includes("couldn't find a shopify customer") || lower.includes("could not find a shopify customer")) {
    return usesCustomerOrOrderContext(plan)
  }

  return true
}

export function isShopifyCustomerWarning(warning: string): boolean {
  const lower = warning.toLowerCase()
  return lower.includes("couldn't find a shopify customer") || lower.includes("could not find a shopify customer")
}

export function isPlanWarningBlocking(warning: string, plan: AgentPlan): boolean {
  return warningBlocksQuickReply(warning, plan)
}

export function planWarningTiers(plan: AgentPlan): { blocking: string[]; informational: string[] } {
  const blocking: string[] = []
  const informational: string[] = []
  for (const warning of plan.warnings ?? []) {
    if (warningBlocksQuickReply(warning, plan)) blocking.push(warning)
    else informational.push(warning)
  }
  return { blocking, informational }
}

const NEEDS_REVIEW: HomePlanClassification = {
  kind: "needs_review",
  replyText: null,
  sendReplyToolCall: null,
  question: null,
}

function detectQuickReply(plan: AgentPlan): HomePlanClassification {
  if (plan.orderStatusFastPath) {
    const sendReplyToolCall = plan.rawToolCalls.find((toolCall) => toolCall.name === "send_reply") ?? null;
    return {
      kind: "needs_review",
      replyText: replyTextFromToolCall(sendReplyToolCall),
      sendReplyToolCall,
      question: null,
    };
  }

  if (plan.steps.length !== 1 || plan.steps[0].tool !== "send_reply") {
    return NEEDS_REVIEW
  }

  const sendReplyCalls = plan.rawToolCalls.filter(toolCall => toolCall.name === "send_reply")
  if (sendReplyCalls.length !== 1 || sendReplyCalls[0].id !== plan.steps[0].id) {
    return NEEDS_REVIEW
  }

  const sendReplyToolCall = sendReplyCalls[0]
  const rawCallsAreSafe = plan.rawToolCalls.every(toolCall => (
    toolCall.id === sendReplyToolCall.id
      ? toolCall.name === "send_reply"
      : QUICK_REPLY_READ_TOOLS.has(toolCall.name)
  ))
  const replyText = replyTextFromToolCall(sendReplyToolCall)

  if (!rawCallsAreSafe || !replyText) {
    return NEEDS_REVIEW
  }

  return { kind: "quick_reply", replyText, sendReplyToolCall, question: null }
}

export interface ClassifyHomePlanOptions {
  filterStatus?: string | null
}

function applyQuestionableSenderPolicy(
  classification: HomePlanClassification,
  filterStatus?: string | null,
): HomePlanClassification {
  if (
    isQuestionableSender(filterStatus)
    && (classification.kind === "quick_reply" || classification.kind === "auto_execute")
  ) {
    return NEEDS_REVIEW
  }
  return classification
}

export function classifyHomePlan(
  plan: AgentPlan | null,
  settings?: Partial<OrgSettings> | OrgSettings | null,
  options?: ClassifyHomePlanOptions,
): HomePlanClassification {
  if (!plan) {
    return applyQuestionableSenderPolicy(NEEDS_REVIEW, options?.filterStatus)
  }

  // An ask_operator plan parks the ticket for the merchant — a state distinct
  // from a customer-facing reply. The agent chose to ask, so surface it before
  // the warning / quick-reply / questionable-sender checks (which are about
  // customer-facing sends). Mirrors how escalate short-circuits in the planner.
  const askOperatorCall = plan.rawToolCalls.find((toolCall) => toolCall.name === "ask_operator") ?? null
  if (askOperatorCall) {
    return {
      kind: "needs_merchant_input",
      replyText: null,
      sendReplyToolCall: null,
      question: questionFromToolCall(askOperatorCall),
    }
  }

  if ((plan.warnings ?? []).some(warning => warningBlocksQuickReply(warning, plan))) {
    return applyQuestionableSenderPolicy(NEEDS_REVIEW, options?.filterStatus)
  }

  const resolved = resolveAgentSettings(settings ?? null)
  const tier: AutonomyTier = resolved.autonomyTier ?? "guarded"

  const mutativeCalls = plan.rawToolCalls.filter(tc => TOOL_CATEGORIES[tc.name] === "action")

  if (mutativeCalls.length > 0) {
    if (!TIERS_THAT_AUTO_EXECUTE.has(tier)) {
      return applyQuestionableSenderPolicy(NEEDS_REVIEW, options?.filterStatus)
    }
    const policyClean = mutativeCalls.every(tc => !checkStaticToolPolicy(tc.name, tc.input, resolved).blocked)
    if (!policyClean) {
      return applyQuestionableSenderPolicy(NEEDS_REVIEW, options?.filterStatus)
    }
    const sendReplyToolCall = plan.rawToolCalls.find(tc => tc.name === "send_reply") ?? null
    const replyText = replyTextFromToolCall(sendReplyToolCall)
    if (!sendReplyToolCall || !replyText) {
      return applyQuestionableSenderPolicy(NEEDS_REVIEW, options?.filterStatus)
    }
    return applyQuestionableSenderPolicy(
      { kind: "auto_execute", replyText, sendReplyToolCall, question: null },
      options?.filterStatus,
    )
  }

  const quickReply = detectQuickReply(plan)
  if (quickReply.kind === "quick_reply" && tier === "watch") {
    return applyQuestionableSenderPolicy(NEEDS_REVIEW, options?.filterStatus)
  }
  return applyQuestionableSenderPolicy(quickReply, options?.filterStatus)
}

function findActionStep(plan: AgentPlan): PlanStep | null {
  const stepsByTool = new Map(plan.steps.map((step) => [step.tool, step]))
  for (const tool of ACTION_TOOL_PRIORITY) {
    const found = stepsByTool.get(tool)
    if (found) return found
  }
  return null
}

function trim(text: string, max = 110): string {
  const cleaned = text.replace(/^"([\s\S]*)"$/, "$1").trim()
  return cleaned.length > max ? `${cleaned.slice(0, max - 3)}…` : cleaned
}

// Refusal / meta patterns an older summarizer produced for sparse messages.
// A summary matching these is unusable as a title — fall through to the raw
// message instead of surfacing "I don't have a thread to summarize."
const LOW_QUALITY_SUMMARY_PATTERNS = [
  /^i (don'?t|do not) have/i,
  /^i (can'?t|cannot|am unable)/i,
  /^i'?m unable/i,
  /no (customer )?support thread/i,
  /could you (please )?(share|provide|send)/i,
  /please (share|provide|send) (the|more|details)/i,
]

function isLowQualitySummary(summary: string): boolean {
  const trimmed = summary.trim()
  if (trimmed.length < 6) return true
  return LOW_QUALITY_SUMMARY_PATTERNS.some((rx) => rx.test(trimmed))
}

// Turns the third-person summary ("Customer is asking whether…") into a clean
// subject-line fragment ("Asking whether…"). Strips the "Customer" lead-in and
// any trailing auxiliary so we never leave a dangling verb ("Is asking…").
function subjectFromSummary(summary: string): string {
  const stripped = summary
    .replace(/^\s*(the\s+)?customer\s+(is\s+|are\s+|was\s+|were\s+|has\s+|have\s+|had\s+|been\s+)*/i, "")
    .trim()
  if (!stripped) return trim(summary, 100)
  return trim(stripped[0].toUpperCase() + stripped.slice(1), 100)
}

function warningLead(warning: string): string {
  const head = warning.split(/\s[-–,]\s/)[0] ?? warning
  return head.replace(/[.?!]+$/, "").trim()
}

function actionPhraseFor(step: PlanStep): string {
  const fixed = TOOL_PHRASE[step.tool]
  if (fixed) return fixed
  if (step.description) return trim(step.description, 60)
  return step.label || step.tool.replace(/_/g, " ")
}

function summarizeActionChain(plan: AgentPlan, excludeStepId?: string): string {
  const seen = new Set<string>()
  const phrases: string[] = []
  for (const step of plan.steps) {
    if (step.id === excludeStepId) continue
    const phrase = actionPhraseFor(step)
    if (!phrase || seen.has(phrase)) continue
    seen.add(phrase)
    phrases.push(phrase)
    if (phrases.length === 3) break
  }
  return phrases.join(" + ")
}

function buildProposal(plan: AgentPlan | null, headlineStep?: PlanStep | null): string {
  if (!plan) return "No plan generated — open ticket to draft reply"
  const warnings = (plan.warnings ?? []).slice(0, 2).flatMap((warning) => {
    const lead = warningLead(warning)
    return lead ? [lead] : []
  })
  const action = summarizeActionChain(plan, headlineStep?.id)
  if (warnings.length === 0 && !action) {
    return "No plan generated — open ticket to draft reply"
  }
  if (warnings.length === 0) return action
  const left = warnings.join(". ")
  return action ? `${left} — ${action}` : left
}

function orderRefFromPlan(plan: AgentPlan): string | null {
  const lookup = plan.rawToolCalls.find(c => c.name === "get_order_by_name")
  const name = (lookup?.input as { order_name?: string } | undefined)?.order_name
  if (typeof name !== "string" || !name.trim()) return null
  return name.startsWith("#") ? name : `#${name}`
}

export function buildPlanPreview(
  plan: AgentPlan | null,
  aiSummary: string | null,
  firstMessage: string | null,
): PlanPreview {
  const action = plan ? findActionStep(plan) : null
  const proposal = buildProposal(plan, action)
  const actionText = action ? (action.description ? trim(action.description, 160) : (action.label || null)) : null

  if (action) {
    const headline = action.description ? trim(action.description, 90) : (action.label || "Run action")
    const context = aiSummary?.trim() ? trim(aiSummary, 140) : ""
    return { headline, context, proposal, actionText, orderRef: plan ? orderRefFromPlan(plan) : null }
  }

  const usableSummary = aiSummary?.trim() && !isLowQualitySummary(aiSummary) ? aiSummary : null
  const headline =
    usableSummary ? subjectFromSummary(usableSummary) :
    firstMessage?.trim() ? trim(firstMessage, 100) :
    "New customer message"
  return { headline, context: "", proposal, actionText, orderRef: plan ? orderRefFromPlan(plan) : null }
}
