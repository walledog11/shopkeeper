import { isOperatorChannel } from "@shopkeeper/agent/thread-constants"
import type { ActionLogEntry } from "@/types"
import { buildAgentPanelHref } from "./panel"

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
