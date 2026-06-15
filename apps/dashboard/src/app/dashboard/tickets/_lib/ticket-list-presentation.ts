import {
  getCurrentPlanForThread,
  type PlanThreadMessage,
} from "@shopkeeper/agent/plan-cache-shape"
import {
  buildPlanPreview,
  classifyHomePlan,
  type HomePlanKind,
} from "@shopkeeper/agent/plan-preview"
import { SENDER_TYPE } from "@shopkeeper/agent/thread-constants"
import { getChannelInfo } from "@/lib/messaging/channels"
import { customerDisplayLabel, timeAgoShort } from "@/lib/messaging/customer-display"
import type { OrgSettings, SenderType, Thread, ThreadStatus } from "@/types"
import {
  resolveTicketCocoAction,
  type TicketCocoAction,
} from "./resolve-ticket-coco-action"

export type TicketTriageTier =
  | "approve"
  | "review"
  | "waiting"
  | "noise"
  | "closed"

export type TicketListPresentationStatusTone = "send" | "caution" | "neutral" | "danger"

export interface TicketListPresentation {
  tier: TicketTriageTier
  headline: string
  subline: string
  customerLabel: string
  channelName: string
  timeAgo: string
  primaryStatus: { label: string; tone: TicketListPresentationStatusTone }
  action: TicketCocoAction | null
  showSubject: boolean
}

export const TRIAGE_TIER_SORT_ORDER: readonly TicketTriageTier[] = [
  "approve",
  "review",
  "waiting",
  "noise",
  "closed",
]

export interface BuildTicketListPresentationInput {
  thread: Pick<
    Thread,
    | "channelType"
    | "status"
    | "lastMessageAt"
    | "aiSummary"
    | "subject"
    | "tag"
    | "cachedPlan"
    | "cachedPlanMessageId"
    | "filterStatus"
    | "shopifyCustomerId"
    | "customer"
  > & {
    messages: Array<Pick<Thread["messages"][number], "id" | "senderType" | "contentText" | "sentAt">>
  }
  orgSettings?: Partial<OrgSettings> | null
  agentName?: string
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
  if (planHeadline.trim()) return planHeadline
  if (thread.tag && thread.tag !== "General") return thread.tag
  if (thread.subject?.trim()) return clampText(thread.subject, 100)
  return "New customer message"
}

function primaryStatusForTier(
  tier: TicketTriageTier,
  action: TicketCocoAction | null,
  questionable: boolean,
): TicketListPresentation["primaryStatus"] {
  if (questionable) {
    return { label: "Review sender", tone: "caution" }
  }

  switch (tier) {
    case "approve":
      return { label: "Ready to send", tone: "send" }
    case "review":
      if (action?.variant === "caution") {
        return { label: action.shortLabel === "Refund" ? "Review refund" : "Needs review", tone: "caution" }
      }
      return { label: action?.label ?? "Needs review", tone: "caution" }
    case "waiting":
      if (action?.variant === "loading") return { label: "Working…", tone: "neutral" }
      if (action?.handler === "draft-reply" || action?.handler === "refresh-draft") {
        return { label: action.label, tone: "neutral" }
      }
      return { label: "Waiting on agent", tone: "neutral" }
    case "noise":
      return { label: "Unverified sender", tone: "caution" }
    case "closed":
      return { label: "Closed", tone: "neutral" }
  }
}

function applyQuestionableTrustRule(
  tier: TicketTriageTier,
  action: TicketCocoAction | null,
  hasPlan: boolean,
): { tier: TicketTriageTier; action: TicketCocoAction | null } {
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
  classificationKind: HomePlanKind | null,
  awaitingReply: boolean,
): TicketTriageTier {
  if (status === "closed" || activeTab === "closed") return "closed"
  if (questionable) return hasPlan ? "review" : "noise"
  if (hasPlan) return classificationKind === "quick_reply" ? "approve" : "review"
  if (awaitingReply) return "waiting"
  return "waiting"
}

export function compareTicketTriageTier(a: TicketTriageTier, b: TicketTriageTier): number {
  return TRIAGE_TIER_SORT_ORDER.indexOf(a) - TRIAGE_TIER_SORT_ORDER.indexOf(b)
}

export function buildTicketListPresentation(
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

  const classification = plan ? classifyHomePlan(plan, orgSettings) : null
  let tier = resolveTier(
    thread.status,
    activeTab,
    questionable,
    hasPlan,
    classification?.kind ?? null,
    awaitingReply,
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
    shopifyCustomerId: thread.shopifyCustomerId,
    thread,
  })

  if (questionable) {
    const trust = applyQuestionableTrustRule(tier, action, hasPlan)
    tier = trust.tier
    action = trust.action
  }

  const channel = getChannelInfo(thread.channelType)
  const subline = clampText(
    copy.proposal || copy.context || previewSource,
    200,
  )

  const mobileQueueView = isMobile && (listView === "for_me" || listView === "all_open")

  return {
    tier,
    headline: headlineFallback(thread, copy.headline),
    subline,
    customerLabel: customerDisplayLabel(thread.customer),
    channelName: channel.name,
    timeAgo: timeAgoShort(new Date(thread.lastMessageAt), now),
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
  subject: string
  tag: string
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
      aiSummary: ticket.aiSummary,
      subject: ticket.subject,
      tag: ticket.tag,
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
