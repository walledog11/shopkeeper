import { buildPlanPreview } from "@shopkeeper/agent/plan-preview"
import { SENDER_TYPE } from "@shopkeeper/agent/thread-constants"
import type { AgentPlan, Ticket } from "@/types"

function latestCustomerMessage(ticket: Ticket) {
  return [...ticket.messages]
    .reverse()
    .find(message => message.sender === SENDER_TYPE.CUSTOMER)
}

function latestNonNoteMessage(ticket: Ticket) {
  return [...ticket.messages]
    .reverse()
    .find(message => message.sender !== SENDER_TYPE.NOTE)
}

function clean(text: string | null | undefined): string | null {
  const trimmed = text?.trim()
  return trimmed ? trimmed : null
}

export function buildTicketBriefSummary({
  ticket,
  aiSummary,
  aiTitle,
  plan,
}: {
  ticket: Ticket
  aiSummary?: string | null
  aiTitle?: string | null
  plan?: AgentPlan | null
}): string | null {
  const title = clean(aiTitle ?? ticket.aiTitle)
  if (title) return title

  const summary = aiSummary ?? ticket.aiSummary
  const previewSource =
    latestCustomerMessage(ticket)?.text ??
    latestNonNoteMessage(ticket)?.text ??
    null
  const preview = buildPlanPreview(plan ?? null, summary, previewSource)
  const headline = clean(preview.headline)

  if (headline && headline !== ticket.tag) return headline
  return clean(ticket.subject) ?? clean(summary) ?? clean(previewSource)
}
