import { getCurrentPlanForThread } from "@shopkeeper/agent/plan-cache-shape"
import {
  buildPlanPreview,
  classifyHomePlan,
  isEscalationOnlyPlan,
  planEscalationReason,
  planReplyText,
} from "@shopkeeper/agent/plan-preview"
import { SENDER_TYPE } from "@shopkeeper/agent/thread-constants"
import type { TicketCardMeta } from "@/app/dashboard/_components/home/needs-you-card-ui"
import { getChannelInfo } from "@/lib/messaging/channels"
import { customerDisplayLabel, timeAgoShort } from "@/lib/messaging/customer-display"
import type { OrgSettings, Ticket } from "@/types"

/**
 * The three things a merchant can be asked for, plus the sender-trust exception —
 * which is a decision about the sender, not about the work, so it renders as a pair.
 */
export type InboxRowDecision = "send" | "review" | "answer" | "trust"

export interface InboxRow {
  who: string
  channelName: string
  channelLogo: string
  said: string
  when: string
  decision: InboxRowDecision | null
  isClosed: boolean
}

export interface BuildInboxRowOptions {
  orgSettings?: Partial<OrgSettings> | null
  now?: Date
}

function clamp(text: string | null | undefined, max: number): string {
  const cleaned = (text ?? "").replace(/\s+/g, " ").trim()
  if (!cleaned) return ""
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned
}

function planMessages(ticket: Ticket) {
  return ticket.messages.map(message => ({ id: message.id, senderType: message.sender }))
}

function latestCustomerMessage(ticket: Ticket) {
  return [...ticket.messages].reverse().find(message => message.sender === SENDER_TYPE.CUSTOMER)
}

function latestNonNoteMessage(ticket: Ticket) {
  return [...ticket.messages].reverse().find(message => message.sender !== SENDER_TYPE.NOTE)
}

/**
 * One sentence, newest fact first: what the agent is proposing, or — when nothing
 * is pending — what was last actually said. Never a status word ("Drafting…"),
 * because a row that reports machine state asks the merchant to operate the machine.
 */
function rowSentence(ticket: Ticket): string {
  const messages = planMessages(ticket)
  const plan = getCurrentPlanForThread(ticket, messages)
  const latestCustomer = latestCustomerMessage(ticket)
  const latestAny = latestNonNoteMessage(ticket)
  const preview = buildPlanPreview(
    plan,
    ticket.aiSummary,
    latestCustomer?.text ?? latestAny?.text ?? null,
  )

  if (isEscalationOnlyPlan(plan)) {
    return clamp(
      planEscalationReason(plan) ?? "Flagged this for you — I didn't draft a reply.",
      180,
    )
  }

  const reply = planReplyText(plan)
  if (preview.actionText) return clamp(preview.actionText, 180)
  if (reply) return clamp(reply, 180)

  if (ticket.filterStatus === "questionable" && !plan) {
    return clamp(ticket.filterReason || "I don't think this is a customer.", 180)
  }

  // No plan pending: the row is history, so it reports the last thing said rather
  // than a summary of what the customer wanted.
  if (latestAny && latestAny.sender !== SENDER_TYPE.CUSTOMER && latestAny.text?.trim()) {
    return clamp(latestAny.text, 180)
  }

  return clamp(preview.headline || ticket.preview, 180)
}

function rowDecision(ticket: Ticket, orgSettings?: Partial<OrgSettings> | null): InboxRowDecision | null {
  if (ticket.status === "closed") return null
  if (ticket.filterStatus === "filtered") return null
  if (ticket.filterStatus === "questionable") return "trust"

  const plan = getCurrentPlanForThread(ticket, planMessages(ticket))
  if (isEscalationOnlyPlan(plan) || ticket.escalatedAt) return "review"
  if (!plan) return null

  const { kind } = classifyHomePlan(plan, orgSettings, { filterStatus: ticket.filterStatus })
  if (kind === "needs_merchant_input") return "answer"
  if (kind === "quick_reply") return "send"
  return "review"
}

export function buildInboxRow(ticket: Ticket, options: BuildInboxRowOptions = {}): InboxRow {
  const { orgSettings = null, now = new Date() } = options
  const channel = getChannelInfo(ticket.channelType)

  return {
    who: customerDisplayLabel(ticket.customerRecord),
    channelName: channel.name,
    channelLogo: channel.logo,
    said: rowSentence(ticket),
    when: timeAgoShort(new Date(ticket.lastMessageAt), now),
    decision: rowDecision(ticket, orgSettings),
    isClosed: ticket.status === "closed",
  }
}

/** Decisions the pointer counts. Sender trust is about the sender, not the work. */
export function isOutstandingDecision(decision: InboxRowDecision | null): boolean {
  return decision === "send" || decision === "review" || decision === "answer"
}

function extractOrderRefFromText(text: string): string | null {
  const orderMatch = text.match(/\border\s*(#?\d{3,})\b/i)
  if (orderMatch) {
    const raw = orderMatch[1]
    return raw.startsWith("#") ? raw : `#${raw}`
  }
  const hashMatch = text.match(/(#\d{3,})/)
  return hashMatch ? hashMatch[1] : null
}

function resolveOrderRef(ticket: Ticket, planOrderRef: string | null): string | null {
  const fromPlan = planOrderRef?.trim()
  if (fromPlan) return fromPlan
  if (!ticket.shopifyCustomerId) return null

  for (const text of [ticket.aiTitle, ticket.aiSummary, ticket.subject]) {
    if (!text?.trim()) continue
    const ref = extractOrderRefFromText(text)
    if (ref) return ref
  }

  return null
}

/** Header pills for the open conversation. */
export function buildTicketCardMeta(ticket: Ticket): TicketCardMeta {
  const plan = getCurrentPlanForThread(ticket, planMessages(ticket))
  const latestCustomer = latestCustomerMessage(ticket)
  const preview = buildPlanPreview(
    plan,
    ticket.aiSummary,
    latestCustomer?.text ?? ticket.messages.at(-1)?.text ?? null,
  )

  return {
    channelName: getChannelInfo(ticket.channelType).name,
    customerName: ticket.customerRecord ? customerDisplayLabel(ticket.customerRecord) : null,
    lastMessageAt: ticket.lastMessageAt,
    tag: ticket.tag || null,
    orderRef: resolveOrderRef(ticket, preview.orderRef),
    isVip: false,
  }
}
