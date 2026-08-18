import { getCurrentPlanForThread } from "@shopkeeper/agent/plan-cache-shape"
import {
  buildPlanPreview,
  classifyHomePlan,
  isEscalationOnlyPlan,
  merchantRoutingQuestionFromCustomerMessage,
} from "@shopkeeper/agent/plan-preview"
import { SENDER_TYPE } from "@shopkeeper/agent/thread-constants"
import type { TicketCardMeta } from "@/app/dashboard/_components/home/needs-you-card-ui"
import { getChannelInfo } from "@/lib/messaging/channels"
import { customerDisplayLabel } from "@/lib/messaging/customer-display"
import {
  buildTicketListPresentationFromTicket,
  type TicketListPresentationStatusTone,
  type TicketTriageTier,
} from "./ticket-list-presentation"
import type { OrgSettings, ThreadRequestDisposition, Ticket } from "@/types"

/** Work the merchant can do from the list, plus sender-trust judgment. */
export type InboxRowDecision = "send" | "review" | "answer" | "trust"

/** How a ticket is bucketed in the inbox stream. */
export type InboxSection =
  | "needs_review"
  | "waiting_on_customer"
  | "external"
  | "spam"

export const INBOX_SECTION_ORDER: readonly InboxSection[] = [
  "needs_review",
  "waiting_on_customer",
  "external",
  "spam",
]

export interface InboxRowStatus {
  label: string
  tone: TicketListPresentationStatusTone
}

export interface InboxRow {
  customerLabel: string
  channelName: string
  headline: string
  preview: string
  when: string
  status: InboxRowStatus
  decision: InboxRowDecision | null
  merchantQuestion: string | null
  section: InboxSection
  tier: TicketTriageTier
  isClosed: boolean
  isQuestionable: boolean
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

function latestNonNoteMessage(ticket: Ticket) {
  return [...ticket.messages].reverse().find(message => message.sender !== SENDER_TYPE.NOTE)
}

function latestCustomerMessage(ticket: Ticket) {
  return [...ticket.messages].reverse().find(message => message.sender === SENDER_TYPE.CUSTOMER)
}

/** Mirrors gateway `mayParkMerchantWork` — greetings and thank-yous are not queue work. */
export function dispositionBlocksMerchantWork(
  disposition: ThreadRequestDisposition | null | undefined,
): boolean {
  return disposition === "none" || disposition === "acknowledgement"
}

/** Shopify webhook threads are platform notifications, not customer conversations. */
export function isShopifySystemThread(ticket: Ticket): boolean {
  return ticket.channelType === "shopify"
}

function questionableNeedsMerchant(
  ticket: Ticket,
  tier: TicketTriageTier,
  decision: InboxRowDecision | null,
): boolean {
  return decision === "answer" || tier === "escalated" || Boolean(ticket.escalatedAt)
}

const NEEDS_REVIEW_TIERS = new Set<TicketTriageTier>([
  "escalated",
  "answer",
  "review",
  "ready",
  "working",
])

function resolveMerchantQuestion(
  ticket: Ticket,
  orgSettings?: Partial<OrgSettings> | null,
): string | null {
  const plan = getCurrentPlanForThread(ticket, planMessages(ticket))
  if (!plan) return null

  const classification = classifyHomePlan(plan, orgSettings, { filterStatus: ticket.filterStatus })
  if (classification.kind !== "needs_merchant_input") return null
  if (classification.question) return classification.question

  return merchantRoutingQuestionFromCustomerMessage(latestCustomerMessage(ticket)?.text)
}

function rowDecision(ticket: Ticket, orgSettings?: Partial<OrgSettings> | null): InboxRowDecision | null {
  if (ticket.status === "closed") return null
  if (ticket.filterStatus === "filtered") return null
  if (isShopifySystemThread(ticket)) return null
  if (dispositionBlocksMerchantWork(ticket.requestDisposition)) return null

  const plan = getCurrentPlanForThread(ticket, planMessages(ticket))
  if (ticket.filterStatus === "questionable" && !plan) return "trust"

  if (isEscalationOnlyPlan(plan) || ticket.escalatedAt) return "review"
  if (!plan) return null

  const { kind } = classifyHomePlan(plan, orgSettings, { filterStatus: ticket.filterStatus })
  if (kind === "needs_merchant_input") return "answer"

  // Unrecognized senders can still ask a real question, but routine deflection
  // drafts do not need merchant approval — trust the sender first.
  if (ticket.filterStatus === "questionable") return null

  if (kind === "quick_reply") return "send"
  return "review"
}

export function resolveInboxSection(
  ticket: Ticket,
  tier: TicketTriageTier,
  decision: InboxRowDecision | null,
): InboxSection {
  if (ticket.filterStatus === "filtered") return "spam"
  if (isShopifySystemThread(ticket)) return "external"
  if (dispositionBlocksMerchantWork(ticket.requestDisposition)) return "waiting_on_customer"
  if (
    ticket.filterStatus === "questionable"
    && !questionableNeedsMerchant(ticket, tier, decision)
  ) {
    return "external"
  }
  if (tier === "noise" || decision === "trust") return "external"
  if (tier === "waiting_customer" || tier === "closed") return "waiting_on_customer"
  if (decision !== null || NEEDS_REVIEW_TIERS.has(tier)) return "needs_review"
  return "waiting_on_customer"
}

function rowPreview(
  ticket: Ticket,
  presentationPreview: string,
  decision: InboxRowDecision | null,
): string {
  if (ticket.filterStatus === "questionable") {
    return clamp(
      ticket.filterReason || presentationPreview || "Unrecognized sender — review before replying.",
      200,
    )
  }

  const latest = latestNonNoteMessage(ticket)
  const latestCustomer = latestCustomerMessage(ticket)
  if (
    !decision
    && latest
    && latest.sender !== SENDER_TYPE.CUSTOMER
    && latest.text?.trim()
  ) {
    const agentSpokeLast = !latestCustomer
      || ticket.messages.findIndex(message => message.id === latest.id)
        > ticket.messages.findIndex(message => message.id === latestCustomer.id)
    if (agentSpokeLast) {
      return `You replied: ${clamp(latest.text, 200)}`
    }
  }

  return presentationPreview
}

export function buildInboxRow(ticket: Ticket, options: BuildInboxRowOptions = {}): InboxRow {
  const { orgSettings = null, now = new Date() } = options
  const presentation = buildTicketListPresentationFromTicket(ticket, {
    orgSettings,
    now,
    activeTab: ticket.status === "closed" ? "closed" : "open",
  })
  const decision = rowDecision(ticket, orgSettings)
  const merchantQuestion = decision === "answer" ? resolveMerchantQuestion(ticket, orgSettings) : null
  const section = resolveInboxSection(ticket, presentation.tier, decision)

  return {
    customerLabel: presentation.customerLabel,
    channelName: presentation.channelName,
    headline: presentation.headline,
    preview: rowPreview(ticket, presentation.subline, decision),
    when: presentation.timeAgo,
    status: presentation.primaryStatus,
    decision,
    merchantQuestion,
    section,
    tier: presentation.tier,
    isClosed: ticket.status === "closed",
    isQuestionable: ticket.filterStatus === "questionable",
  }
}

/** Actionable work first, then the record. Trust rows live in their own section. */
const DECISION_RANK: Record<Exclude<InboxRowDecision, "trust">, number> = {
  send: 0,
  review: 0,
  answer: 0,
}

export function decisionRank(decision: InboxRowDecision | null): number {
  if (decision === "trust") return 2
  return decision === null ? 1 : DECISION_RANK[decision]
}

export function isActionDecision(decision: InboxRowDecision | null): decision is Exclude<InboxRowDecision, "trust"> {
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
  const latestCustomer = [...ticket.messages]
    .reverse()
    .find(message => message.sender === SENDER_TYPE.CUSTOMER)
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
