import { isOperatorChannel } from "@shopkeeper/agent/thread-constants"
import type { ActionLogEntry } from "@/types"
import { buildAgentPanelHref } from "./panel"

export type RequestOutcomeDisplay = {
  label: string
  description: string
}

const PLAN_VERDICT_LABELS: Record<string, string> = {
  quick_reply: "Quick reply",
  needs_review: "Needed approval",
  needs_merchant_input: "Asked you a question",
  auto_execute: "Auto-execute",
  escalate: "Escalation",
  invalid: "Invalid plan",
  manual: "Manual reply",
}

const TERMINAL_RESOLUTION_LABELS: Record<string, string> = {
  auto_resolved: "Auto-resolved",
  merchant_approved: "Merchant resolved",
  merchant_input: "Used your answer",
  escalated: "Escalated",
  failed: "Failed",
  invalid_plan: "Invalid plan",
  dismissed: "Plan dismissed",
  superseded: "Superseded",
  unresolved: "In progress",
}

const REPLY_PROVENANCE_LABELS: Record<
  NonNullable<NonNullable<ActionLogEntry["requestOutcome"]>["replyProvenance"]>,
  string
> = {
  agent_automatic: "Agent sent automatically",
  agent_approved: "You approved the send",
  manual: "You replied manually",
}

export function formatPlanVerdictLabel(planVerdict: string): string {
  return PLAN_VERDICT_LABELS[planVerdict] ?? planVerdict.replaceAll("_", " ")
}

export function formatRequestOutcomeDisplay(
  outcome: NonNullable<ActionLogEntry["requestOutcome"]>,
): RequestOutcomeDisplay {
  let label = TERMINAL_RESOLUTION_LABELS[outcome.terminalResolution]
    ?? outcome.terminalResolution.replaceAll("_", " ")

  if (outcome.terminalResolution === "merchant_approved") {
    if (outcome.replyProvenance === "agent_approved") label = "You approved"
    if (outcome.replyProvenance === "manual") label = "You replied manually"
  } else if (outcome.terminalResolution === "auto_resolved") {
    label = "Auto-resolved"
  }

  const requestType = outcome.requestTag?.trim() || "Untagged request"
  const planVerdict = formatPlanVerdictLabel(outcome.planVerdict)
  const reply = outcome.replyProvenance
    ? REPLY_PROVENANCE_LABELS[outcome.replyProvenance]
    : null
  const merchantAnswered = outcome.merchantInputAnsweredAt
    ? `You answered on ${new Date(outcome.merchantInputAnsweredAt).toLocaleString()}`
    : null

  const descriptionParts = [
    requestType,
    planVerdict,
    reply,
    merchantAnswered,
  ].filter((part): part is string => Boolean(part))

  return {
    label,
    description: descriptionParts.join(" · "),
  }
}

export function formatRequestOutcomeSummary(
  outcome: NonNullable<ActionLogEntry["requestOutcome"]>,
): string {
  const { label, description } = formatRequestOutcomeDisplay(outcome)
  const requestType = outcome.requestTag?.trim()
  return requestType ? `${requestType} · ${label}` : label || description
}

const ORDER_RISK_PREFIX = "order-risk-review:"

export function parseOrderRiskInstruction(instruction: string): { orderId: string } | null {
  if (!instruction.startsWith(ORDER_RISK_PREFIX)) return null
  const orderId = instruction.slice(ORDER_RISK_PREFIX.length).trim()
  return orderId ? { orderId } : null
}

export function orderNameFromSummary(summary: string | null | undefined): string | null {
  if (!summary) return null
  const match = summary.match(/\border\s+(#[\w-]+)/i)
  return match?.[1] ?? null
}

export function formatActionLogHeadline(entry: ActionLogEntry): string {
  const instruction = entry.instruction?.trim()
  if (instruction) {
    const risk = parseOrderRiskInstruction(instruction)
    if (risk) {
      const orderName = orderNameFromSummary(entry.summary)
      return orderName ? `${orderName} flagged for review` : "Order flagged for review"
    }
  }

  const isOperator = isOperatorChannel(entry.channelType)
  if (isOperator) return entry.instruction ?? "Agent session"
  return entry.customerHandle ?? entry.instruction ?? "Workspace action"
}

export function actionLogEntryHref(entry: ActionLogEntry): string | null {
  const instruction = entry.instruction?.trim()
  if (instruction) {
    const risk = parseOrderRiskInstruction(instruction)
    if (risk) {
      const orderName = orderNameFromSummary(entry.summary)
      const query = orderName ?? risk.orderId
      return `/dashboard/orders?q=${encodeURIComponent(query)}`
    }
  }

  if (isOperatorChannel(entry.channelType)) {
    return buildAgentPanelHref({ session: entry.threadId ?? null })
  }
  if (!entry.threadId) return null
  return `/dashboard/tickets?thread=${entry.threadId}`
}

export function correctReplyHref(entry: ActionLogEntry): string | null {
  if (!entry.threadId || isOperatorChannel(entry.channelType)) return null
  return `/dashboard/tickets?thread=${entry.threadId}&correct=1`
}
