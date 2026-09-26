import type { AgentPlan, PlanStep, RawToolCall } from "./types.js"
import { planSignals } from "./plan-signals.js"
import { PLAN_STEP_LABELS } from "./tools/registry/index.js"
import { displayApprovedDraft } from "./reply-placeholders.js"

// Asked when a plan stopped for a gap but the model wrote no question of its
// own. Names what was looked up and missed instead of echoing the customer,
// whose message the merchant is already looking at.
export function merchantGapQuestion(missedKbQueries: readonly string[] = []): string {
  const queries = missedKbQueries.map(query => query.trim()).filter(Boolean)
  if (queries.length === 0) {
    return "I don't have the information to answer this, so I haven't replied. What should I tell the customer?"
  }
  const searched = queries.map(query => `"${query}"`).join(", ")
  return `I searched your knowledge base for ${searched} and found nothing, so I haven't replied. What should I tell the customer?`
}

const ACTION_TOOL_PRIORITY = [
  "create_refund",
  "create_partial_refund",
  "cancel_order",
  "create_exchange",
  "attach_return_label",
  "edit_shopify_order",
  "create_shopify_order",
  "fulfill_order",
  "update_shopify_order_address",
  "update_shopify_customer_info",
  "add_shopify_customer_note",
  "issue_store_credit",
  "create_gift_card",
  "issue_discount",
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

export interface HomeActionDisplay {
  chipLabel: string
  orderRef: string | null
  detailLines: string[]
}

const REPLY_TOOL_NAMES = ["send_reply", "send_email"]

function replyTextFromToolCall(toolCall: RawToolCall | null): string | null {
  const input = toolCall?.input
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const text = (input as { text?: unknown }).text
  return typeof text === "string" && text.trim() ? text.trim() : null
}

// The reply as a merchant reads it: receipt placeholders are shown by what they
// will hold, never as raw tokens.
export function planReplyText(plan: AgentPlan | null): string | null {
  if (!plan) return null
  for (const name of REPLY_TOOL_NAMES) {
    const text = replyTextFromToolCall(plan.rawToolCalls.find(toolCall => toolCall.name === name) ?? null)
    if (text) return displayApprovedDraft(text)
  }
  return null
}

function escalationReasonFromToolCall(toolCall: RawToolCall | null): string | null {
  const input = toolCall?.input
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const reason = (input as { reason?: unknown }).reason
  return typeof reason === "string" && reason.trim() ? reason.trim() : null
}

export function planHasEscalation(plan: AgentPlan | null): boolean {
  if (!plan) return false
  return plan.rawToolCalls.some(toolCall => toolCall.name === "escalate_to_human")
    || plan.steps.some(step => step.tool === "escalate_to_human")
}

export function planEscalationReason(plan: AgentPlan | null): string | null {
  if (!plan) return null
  const fromCall = escalationReasonFromToolCall(
    plan.rawToolCalls.find(toolCall => toolCall.name === "escalate_to_human") ?? null,
  )
  if (fromCall) return fromCall

  const escalateStep = plan.steps.find(step => step.tool === "escalate_to_human")
  if (escalateStep?.description?.trim()) return escalateStep.description.trim()
  if (escalateStep?.label?.trim()) return escalateStep.label.trim()

  const routingReason = plan.routing?.decision === "escalate"
    ? plan.routing.signals?.join(", ")
    : null
  return plan.routingEvidence?.escalationReason?.trim() || routingReason?.trim() || null
}

/** Escalation with no customer-facing send_reply / send_email draft. */
export function isEscalationOnlyPlan(plan: AgentPlan | null): boolean {
  if (!planHasEscalation(plan)) return false
  return !planReplyText(plan)
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

// Display only: the condition clause of a signal message, without the advice
// that follows it. Never used to decide anything — that reads `code`.
function signalLead(message: string): string {
  const head = message.split(/\s[-–,]\s/)[0] ?? message
  return head.replace(/[.?!]+$/, "").trim()
}

// On a read step the description is the planner narrating its own lookup
// ("Check the carrier scan history for order #1042"), so the registry label
// reads better. Everywhere else the description carries the specifics the
// merchant is deciding on ("Refund $20", the question being asked).
function actionPhraseFor(step: PlanStep): string {
  const fixed = TOOL_PHRASE[step.tool]
  if (fixed) return fixed
  if (step.category === "read" && step.label) return step.label
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
  return phrases.join(", then ")
}

// Empty when there is nothing of the agent's own to say. Callers fall through
// to the customer's own message rather than printing the agent's internal
// status where the merchant expects to read the ticket.
function buildProposal(plan: AgentPlan | null, headlineStep?: PlanStep | null): string {
  if (!plan) return ""
  const leads = planSignals(plan).slice(0, 2).flatMap((signal) => {
    const lead = signalLead(signal.message)
    return lead ? [lead] : []
  })
  const action = summarizeActionChain(plan, headlineStep?.id)
  if (leads.length === 0 && !action) {
    return ""
  }
  if (leads.length === 0) return action
  const left = leads.join(". ")
  return action ? `${left} — ${action}` : left
}

function orderRefFromPlan(plan: AgentPlan): string | null {
  const lookup = plan.rawToolCalls.find(c => c.name === "get_order_by_name")
  const name = (lookup?.input as { order_name?: string } | undefined)?.order_name
  if (typeof name === "string" && name.trim()) {
    return name.startsWith("#") ? name : `#${name}`
  }

  for (const toolCall of plan.rawToolCalls) {
    const ref = orderRefFromToolInput(toolCall.input)
    if (ref) return ref
  }

  return null
}

function orderRefFromToolInput(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const orderName = record.order_name ?? record.order_number
  if (typeof orderName === "string" && orderName.trim()) {
    const trimmed = orderName.trim()
    return trimmed.startsWith("#") ? trimmed : `#${trimmed}`
  }
  return null
}

function rawToolCallForStep(plan: AgentPlan, step: PlanStep): RawToolCall | null {
  const byId = plan.rawToolCalls.find(toolCall => toolCall.id === step.id)
  if (byId) return byId
  return plan.rawToolCalls.find(toolCall => toolCall.name === step.tool) ?? null
}

function formatAddressDetailLines(input: Record<string, unknown>): string[] {
  const lines: string[] = []
  if (typeof input.address1 === "string" && input.address1.trim()) {
    lines.push(input.address1.trim())
  }
  if (typeof input.address2 === "string" && input.address2.trim()) {
    lines.push(input.address2.trim())
  }
  const cityLine = [input.city, input.province, input.zip]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(", ")
  if (cityLine) lines.push(cityLine)
  const country = typeof input.country === "string" ? input.country.trim() : ""
  if (country && country !== "US" && country !== "United States") {
    lines.push(country)
  }
  return lines
}

function actionChipLabel(step: PlanStep): string {
  if (step.label?.trim()) return step.label.trim()
  return PLAN_STEP_LABELS[step.tool] ?? step.tool.replace(/_/g, " ")
}

function buildHomeActionDisplayFromTool(
  step: PlanStep,
  toolCall: RawToolCall | null,
): HomeActionDisplay {
  const input = (toolCall?.input ?? {}) as Record<string, unknown>
  const orderRef = orderRefFromToolInput(input)
  let chipLabel = actionChipLabel(step)
  let detailLines: string[] = []

  switch (step.tool) {
    case "create_refund": {
      const amount = input.amount
      if (typeof amount === "string" || typeof amount === "number") {
        const normalized = String(amount).replace(/^\$/, "").trim()
        chipLabel = normalized ? `Issue $${normalized} refund` : "Issue refund"
      }
      if (typeof input.reason === "string" && input.reason.trim()) {
        detailLines = [input.reason.trim()]
      }
      break
    }
    case "create_partial_refund": {
      const amount = input.approval_amount
      const currency = typeof input.approval_currency === "string"
        ? input.approval_currency.trim().toUpperCase()
        : ""
      if (typeof amount === "string" || typeof amount === "number") {
        const normalized = String(amount).replace(/^\$/, "").trim()
        chipLabel = normalized
          ? `Issue ${currency && currency !== "USD" ? `${currency} ` : "$"}${normalized} partial refund`
          : "Issue partial refund"
      }
      if (typeof input.reason === "string" && input.reason.trim()) {
        detailLines = [input.reason.trim()]
      }
      break
    }
    case "update_shopify_order_address":
      chipLabel = "Update address"
      detailLines = formatAddressDetailLines(input)
      break
    case "cancel_order":
      chipLabel = "Cancel order"
      if (typeof input.reason === "string" && input.reason.trim()) {
        detailLines = [input.reason.trim()]
      }
      break
    case "issue_store_credit": {
      const amount = input.amount
      if (typeof amount === "string" || typeof amount === "number") {
        chipLabel = `Issue $${String(amount).replace(/^\$/, "").trim()} store credit`
      }
      break
    }
    case "create_gift_card": {
      const amount = input.amount
      if (typeof amount === "string" || typeof amount === "number") {
        chipLabel = `Create $${String(amount).replace(/^\$/, "").trim()} gift card`
      }
      break
    }
    case "issue_discount":
      if (typeof input.percentage === "string" || typeof input.percentage === "number") {
        chipLabel = `Issue ${input.percentage}% discount`
      }
      break
    case "fulfill_order":
      chipLabel = "Mark fulfilled"
      if (typeof input.tracking_number === "string" && input.tracking_number.trim()) {
        detailLines = [`Tracking ${input.tracking_number.trim()}`]
      }
      break
    default:
      break
  }

  return { chipLabel, orderRef, detailLines }
}

export function buildHomeActionDisplay(plan: AgentPlan | null): HomeActionDisplay | null {
  if (!plan) return null
  const step = findActionStep(plan)
  if (!step) return null
  return buildHomeActionDisplayFromTool(step, rawToolCallForStep(plan, step))
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
