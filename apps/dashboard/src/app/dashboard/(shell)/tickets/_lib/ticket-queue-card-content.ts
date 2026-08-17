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
import type { BubbleTone } from "@/app/dashboard/_components/home/needs-you-card-styles"
import { getChannelInfo } from "@/lib/messaging/channels"
import { customerDisplayLabel } from "@/lib/messaging/customer-display"
import type { OrgSettings } from "@/types"
import type { TicketPresentationSource } from "./ticket-list-presentation"

export interface TicketQueueCardBubble {
  key: string
  text: string
  tone: BubbleTone
}

export interface TicketQueueCardContent {
  meta: TicketCardMeta
  customerMessage: string | null
  bubbles: TicketQueueCardBubble[]
  isEscalationOnly: boolean
  escalationReason: string | null
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

function resolveOrderRef(
  ticket: TicketPresentationSource,
  planOrderRef: string | null,
): string | null {
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

function planMessages(ticket: TicketPresentationSource) {
  return ticket.messages.map(message => ({
    id: message.id,
    senderType: message.sender,
  }))
}

function latestCustomerMessage(ticket: TicketPresentationSource) {
  return [...ticket.messages]
    .reverse()
    .find(message => message.sender === SENDER_TYPE.CUSTOMER)
}

export function buildTicketQueueCardContent(
  ticket: TicketPresentationSource,
  orgSettings?: Partial<OrgSettings> | null,
): TicketQueueCardContent {
  const messages = planMessages(ticket)
  const plan = getCurrentPlanForThread(ticket, messages)
  const latestCustomer = latestCustomerMessage(ticket)
  const customerMessage = (latestCustomer?.text ?? "").trim() || null
  const previewSource = latestCustomer?.text ?? ticket.messages.at(-1)?.text ?? null
  const copy = buildPlanPreview(plan, ticket.aiSummary, previewSource)
  const classification = plan
    ? classifyHomePlan(plan, orgSettings, { filterStatus: ticket.filterStatus })
    : null
  const isEscalationOnly = isEscalationOnlyPlan(plan)
  const escalationReason = planEscalationReason(plan)
  const replyText = planReplyText(plan)
  const isConsequential = classification?.kind === "needs_review"

  const bubbles: TicketQueueCardBubble[] = []
  if (!isEscalationOnly && copy.actionText) {
    bubbles.push({ key: "action", text: copy.actionText, tone: "action" })
  }
  if (replyText) {
    bubbles.push({ key: "reply", text: replyText, tone: "reply" })
  }
  if (!isEscalationOnly && bubbles.length === 0) {
    const text = copy.proposal || copy.context
    if (text) {
      bubbles.push({
        key: "flag",
        text,
        tone: isConsequential ? "flag" : "reply",
      })
    } else if (ticket.filterStatus === "questionable" && !plan) {
      bubbles.push({
        key: "sender-review",
        text: "Verify this sender before Shopkeeper drafts a reply.",
        tone: "flag",
      })
    }
  }

  const channel = getChannelInfo(ticket.channelType)
  const customerName = ticket.customerRecord
    ? customerDisplayLabel(ticket.customerRecord)
    : null

  return {
    meta: {
      channelName: channel.name,
      customerName,
      lastMessageAt: ticket.lastMessageAt,
      tag: ticket.tag || null,
      orderRef: resolveOrderRef(ticket, copy.orderRef),
      isVip: false,
    },
    customerMessage,
    bubbles,
    isEscalationOnly,
    escalationReason,
  }
}
