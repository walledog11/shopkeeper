import {
  getCurrentPlanForThread,
  type PlanThreadMessage,
} from "@shopkeeper/agent/plan-cache-shape"
import { decideAutonomy, type AutonomyKind } from "@shopkeeper/agent/autonomy"
import {
  buildPlanPreview,
  planReplyText,
} from "@shopkeeper/agent/plan-preview"
import { SENDER_TYPE } from "@shopkeeper/agent/thread-constants"
import { getChannelInfo } from "@/lib/messaging/channels"
import { customerDisplayLabel } from "@/lib/messaging/customer-display"
import { formatRelativeTime } from "@/lib/format/date"
import type { OrgSettings, SenderType, Thread, ThreadStatus } from "@/types"
import {
  resolveTicketCocoAction,
  type TicketCocoAction,
} from "./resolve-ticket-coco-action"

export type TicketTriageTier =
  | "escalated"
  | "answer"
  | "review"
  | "ready"
  | "working"
  | "noise"
  | "waiting_customer"
  | "closed"

type TicketListPresentationStatusTone = "send" | "caution" | "neutral" | "danger"

export interface TicketListPresentationStatus {
  label: string
  tone: TicketListPresentationStatusTone
  /** Says why the row's action is needed, so the row shows it beside the button. */
  addsToAction: boolean
}

export interface TicketListPresentation {
  tier: TicketTriageTier
  headline: string
  subline: string
  customerLabel: string
  channelName: string
  timeAgo: string
  primaryStatus: TicketListPresentationStatus
  action: TicketCocoAction | null
  showSubject: boolean
}

export interface BuildTicketListPresentationInput {
  thread: Pick<
    Thread,
    | "channelType"
    | "status"
    | "lastMessageAt"
    | "aiTitle"
    | "aiSummary"
    | "subject"
    | "tag"
    | "escalatedAt"
    | "cachedPlan"
    | "cachedPlanMessageId"
    | "filterStatus"
    | "shopifyCustomerId"
    | "customer"
  > & {
    messages: Array<Pick<Thread["messages"][number], "id" | "senderType" | "contentText" | "sentAt">>
  }
  orgSettings?: Partial<OrgSettings> | null
  agentBusy?: boolean
  activeTab?: "open" | "closed"
  listView?: "for_me" | "all_open" | "closed" | "spam"
  isMobile?: boolean
  hasShopify?: boolean
  now?: Date
}

function clampText(text: string | null | undefined, max = 200): string {
  const cleaned = (text ?? "").trim()
  if (!cleaned) return ""
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned
}

function planMessages(messages: BuildTicketListPresentationInput["thread"]["messages"]): PlanThreadMessage[] {
  return messages.map(message => ({
    id: message.id,
    senderType: message.senderType,
  }))
}

function latestCustomerMessage(
  messages: BuildTicketListPresentationInput["thread"]["messages"],
) {
  return [...messages]
    .reverse()
    .find(message => message.senderType === SENDER_TYPE.CUSTOMER)
}

function latestNonNoteMessage(
  messages: BuildTicketListPresentationInput["thread"]["messages"],
) {
  return [...messages]
    .reverse()
    .find(message => message.senderType !== SENDER_TYPE.NOTE)
}

function headlineFallback(
  thread: BuildTicketListPresentationInput["thread"],
  planHeadline: string,
): string {
  if (thread.aiTitle?.trim()) return clampText(thread.aiTitle, 100)
  if (planHeadline.trim()) return planHeadline
  if (thread.tag && thread.tag !== "General") return thread.tag
  if (thread.subject?.trim()) return clampText(thread.subject, 100)
  return "New customer message"
}

// A ticket's state, never an action: the row's button is the action. A review
// row shows its state only when it says why (flagged, a refund, a Shopify
// change); "Ready to send" beside Send, or "Needs review" beside Review, would
// say nothing the button doesn't.
function primaryStatusForTier(
  tier: TicketTriageTier,
  action: TicketCocoAction | null,
  questionable: boolean,
): TicketListPresentationStatus {
  const reason = (label: string): TicketListPresentationStatus => ({ label, tone: "caution", addsToAction: true })
  switch (tier) {
    case "escalated":
      return reason("Flagged for you")
    case "answer":
      return { label: "Answer needed", tone: "caution", addsToAction: false }
    case "review":
      if (questionable) return reason("Unrecognized sender")
      if (action?.id === "review-refund") return reason("Refund")
      if (action?.id === "your-call") return reason("Shopify change")
      if (action?.id === "link-customer") return reason("Customer not linked")
      if (action?.id === "fix-invalid-draft") return reason("Draft blocked")
      return { label: "Needs review", tone: "caution", addsToAction: false }
    case "ready":
      return { label: "Ready to send", tone: "send", addsToAction: false }
    case "working":
      if (action?.variant === "loading") return { label: action.label, tone: "neutral", addsToAction: false }
      if (action?.handler === "draft-reply") return { label: "No draft yet", tone: "neutral", addsToAction: false }
      if (action?.handler === "refresh-draft") return { label: "Draft out of date", tone: "neutral", addsToAction: false }
      return { label: "Drafting…", tone: "neutral", addsToAction: false }
    case "noise":
      return reason("Unrecognized sender")
    case "waiting_customer":
      return { label: "Waiting on customer", tone: "neutral", addsToAction: false }
    case "closed":
      return { label: "Closed", tone: "neutral", addsToAction: false }
  }
}

function applyQuestionableTrustRule(
  tier: TicketTriageTier,
  action: TicketCocoAction | null,
  hasPlan: boolean,
): { tier: TicketTriageTier; action: TicketCocoAction | null } {
  if (tier === "escalated" || tier === "answer") {
    return { tier, action }
  }

  if (hasPlan) {
    const blockedAction = action?.handler === "quick-approve"
      ? { ...action, handler: "focus-plan" as const, variant: "caution" as const, label: "Review draft", shortLabel: "Review" }
      : action
    return { tier: "review", action: blockedAction }
  }

  return { tier: "noise", action: null }
}

function resolveTier(
  status: ThreadStatus,
  activeTab: "open" | "closed",
  questionable: boolean,
  hasPlan: boolean,
  verdictKind: AutonomyKind | null,
  awaitingReply: boolean,
  escalated: boolean,
): TicketTriageTier {
  if (status === "closed" || activeTab === "closed") return "closed"
  if (escalated) return "escalated"
  if (verdictKind === "escalate") return "escalated"
  if (verdictKind === "needs_merchant_input") return "answer"
  if (questionable) return hasPlan ? "review" : "noise"
  if (hasPlan) return verdictKind === "quick_reply" ? "ready" : "review"
  if (awaitingReply) return "working"
  return "waiting_customer"
}

function buildTicketListPresentation(
  input: BuildTicketListPresentationInput,
): TicketListPresentation {
  const {
    thread,
    orgSettings = null,
    agentBusy = false,
    activeTab = thread.status === "closed" ? "closed" : "open",
    listView,
    isMobile = false,
    hasShopify = true,
    now = new Date(),
  } = input

  const messages = planMessages(thread.messages)
  const plan = getCurrentPlanForThread(thread, messages)
  const latestMessage = latestNonNoteMessage(thread.messages)
  const latestCustomer = latestCustomerMessage(thread.messages)
  const previewSource = latestCustomer?.contentText ?? latestMessage?.contentText ?? null
  const copy = buildPlanPreview(plan, thread.aiSummary, previewSource)
  const questionable = thread.filterStatus === "questionable"
  const hasPlan = plan !== null
  const awaitingReply = latestNonNoteMessage(thread.messages)?.senderType === SENDER_TYPE.CUSTOMER
    && thread.status === "open"

  const verdict = plan ? decideAutonomy(plan, orgSettings, {
    filterStatus: thread.filterStatus,
  }) : null
  let tier = resolveTier(
    thread.status,
    activeTab,
    questionable,
    hasPlan,
    verdict?.kind ?? null,
    awaitingReply,
    Boolean(thread.escalatedAt),
  )

  const lastCustomerMessageAt = latestCustomer?.sentAt ?? null
  let action = resolveTicketCocoAction({
    activeTab,
    agentBusy,
    channelType: thread.channelType,
    hasShopify,
    lastCustomerMessageAt,
    messages,
    orgSettings,
    filterStatus: thread.filterStatus,
    shopifyCustomerId: thread.shopifyCustomerId,
    thread,
  })

  if (questionable) {
    const trust = applyQuestionableTrustRule(tier, action, hasPlan)
    tier = trust.tier
    action = trust.action
  }

  const channel = getChannelInfo(thread.channelType)
  const draftReply = plan ? planReplyText(plan) : null
  const subline = clampText(
    draftReply || copy.proposal || copy.context || previewSource,
    200,
  )

  const mobileQueueView = isMobile && (listView === "for_me" || listView === "all_open")

  return {
    tier,
    headline: headlineFallback(thread, copy.headline),
    subline,
    customerLabel: customerDisplayLabel(thread.customer),
    channelName: channel.name,
    timeAgo: formatRelativeTime(thread.lastMessageAt, now),
    primaryStatus: primaryStatusForTier(tier, action, questionable),
    action,
    showSubject: !mobileQueueView,
  }
}

export interface TicketPresentationSource {
  channelType: Thread["channelType"]
  status: ThreadStatus
  lastMessageAt: string
  aiSummary: string
  aiTitle?: string | null
  subject: string
  tag: string
  escalatedAt: string | null
  cachedPlan: unknown | null
  cachedPlanMessageId: string | null
  filterStatus: Thread["filterStatus"]
  shopifyCustomerId: string | null
  customerRecord: Thread["customer"] | null
  messages: Array<{
    id: string
    sender: SenderType
    text: string | null
    time?: string
  }>
}

export function buildTicketListPresentationFromTicket(
  ticket: TicketPresentationSource,
  options: Omit<BuildTicketListPresentationInput, "thread">,
): TicketListPresentation {
  return buildTicketListPresentation({
    ...options,
    thread: {
      channelType: ticket.channelType,
      status: ticket.status,
      lastMessageAt: ticket.lastMessageAt,
      aiTitle: ticket.aiTitle ?? null,
      aiSummary: ticket.aiSummary,
      subject: ticket.subject,
      tag: ticket.tag,
      escalatedAt: ticket.escalatedAt,
      cachedPlan: ticket.cachedPlan,
      cachedPlanMessageId: ticket.cachedPlanMessageId,
      filterStatus: ticket.filterStatus,
      shopifyCustomerId: ticket.shopifyCustomerId,
      customer: ticket.customerRecord ?? {
        id: "",
        organizationId: "",
        name: null,
        platformId: "",
        profilePicUrl: null,
        createdAt: "",
      },
      messages: ticket.messages.map(message => ({
        id: message.id,
        senderType: message.sender,
        contentText: message.text,
        sentAt: message.time ?? ticket.lastMessageAt,
      })),
    },
  })
}
