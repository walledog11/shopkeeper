import {
  getCurrentPlanForThread,
  getPendingCustomerMessageId,
  isThreadAwaitingReply,
  readAgentPlanCacheRecordShape,
  type PlanThreadMessage,
} from "@shopkeeper/agent/plan-cache-shape"
import {
  classifyHomePlan,
  isPlanWarningBlocking,
  planWarningTiers,
} from "@shopkeeper/agent/plan-preview"
import type { AgentPlan, OrgSettings, Thread } from "@/types"

export type TicketCocoActionVariant = "send" | "draft" | "caution" | "neutral" | "loading"

export type TicketCocoActionHandler =
  | "quick-approve"
  | "focus-plan"
  | "draft-reply"
  | "refresh-draft"
  | "link-customer"

export interface TicketCocoAction {
  id: string
  label: string
  shortLabel: string
  variant: TicketCocoActionVariant
  handler: TicketCocoActionHandler
  instruction?: string
  disabled?: boolean
}

export interface ResolveTicketCocoActionInput {
  activeTab: "open" | "closed"
  agentBusy: boolean
  channelType?: string
  hasShopify: boolean
  isNoteTab?: boolean
  lastCustomerMessageAt?: string | null
  messages: PlanThreadMessage[]
  orgSettings?: Partial<OrgSettings> | null
  shopifyCustomerId?: string | null
  filterStatus?: Thread["filterStatus"] | null
  thread: Pick<Thread, "cachedPlan" | "cachedPlanMessageId"> | null | undefined
}

const REFUND_TOOLS = new Set(["create_refund"])
const CONSEQUENTIAL_ACTION_TOOLS = new Set([
  "create_refund",
  "cancel_order",
  "edit_shopify_order",
  "create_shopify_order",
  "update_shopify_order_address",
])

function planHasConsequentialAction(plan: AgentPlan): boolean {
  return plan.steps.some(step => (
    step.category === "action" || CONSEQUENTIAL_ACTION_TOOLS.has(step.tool)
  ))
}

function planNeedsShopifyLink(plan: AgentPlan, shopifyCustomerId?: string | null): boolean {
  if (shopifyCustomerId) return false
  const { blocking } = planWarningTiers(plan)
  return blocking.some(warning => isPlanWarningBlocking(warning, plan) && (
    warning.toLowerCase().includes("shopify customer")
  ))
}

function hasStaleCachedPlan(
  thread: Pick<Thread, "cachedPlan" | "cachedPlanMessageId">,
  messages: PlanThreadMessage[],
): boolean {
  const pendingCustomerMessageId = getPendingCustomerMessageId(messages)
  if (!pendingCustomerMessageId) return false
  if (!thread.cachedPlanMessageId || thread.cachedPlanMessageId === pendingCustomerMessageId) {
    return false
  }
  return readAgentPlanCacheRecordShape(thread.cachedPlan) !== null
}

function refreshDraftInstruction(
  thread: Pick<Thread, "cachedPlan" | "cachedPlanMessageId">,
): string {
  return readAgentPlanCacheRecordShape(thread.cachedPlan)?.instruction.trim() || "draft a reply"
}

function reviewLabel(plan: AgentPlan): Pick<TicketCocoAction, "id" | "label" | "shortLabel" | "variant"> {
  if (plan.steps.some(step => REFUND_TOOLS.has(step.tool))) {
    return {
      id: "review-refund",
      label: "Review refund",
      shortLabel: "Refund",
      variant: "caution",
    }
  }

  if (planHasConsequentialAction(plan)) {
    return {
      id: "your-call",
      label: "Your call",
      shortLabel: "Review",
      variant: "caution",
    }
  }

  return {
    id: "review-draft",
    label: "Review draft",
    shortLabel: "Review",
    variant: "draft",
  }
}

function replyActionsBlocked(input: ResolveTicketCocoActionInput): boolean {
  if (input.channelType !== "ig_dm" || input.isNoteTab) return false
  const lastCustomerMessageAt = input.lastCustomerMessageAt
  if (!lastCustomerMessageAt) return true
  return Date.now() - new Date(lastCustomerMessageAt).getTime() > 24 * 60 * 60 * 1000
}

export function resolveTicketCocoAction(input: ResolveTicketCocoActionInput): TicketCocoAction | null {
  if (input.activeTab !== "open") return null

  if (input.agentBusy) {
    return {
      id: "working",
      label: "Working…",
      shortLabel: "…",
      variant: "loading",
      handler: "draft-reply",
      disabled: true,
    }
  }

  const awaitingReply = isThreadAwaitingReply(input.messages)
  const currentPlan = input.thread
    ? getCurrentPlanForThread(input.thread, input.messages)
    : null

  if (currentPlan) {
    if (input.hasShopify && planNeedsShopifyLink(currentPlan, input.shopifyCustomerId)) {
      return {
        id: "link-customer",
        label: "Link customer",
        shortLabel: "Link",
        variant: "neutral",
        handler: "link-customer",
      }
    }

    if (replyActionsBlocked(input)) return null

    const classification = classifyHomePlan(currentPlan, input.orgSettings, {
      filterStatus: input.filterStatus,
    })
    if (classification.kind === "quick_reply") {
      return {
        id: "send-reply",
        label: "Send reply",
        shortLabel: "Send",
        variant: "send",
        handler: "quick-approve",
      }
    }

    return {
      ...reviewLabel(currentPlan),
      handler: "focus-plan",
    }
  }

  if (input.thread && awaitingReply && hasStaleCachedPlan(input.thread, input.messages)) {
    if (replyActionsBlocked(input)) return null

    return {
      id: "refresh-draft",
      label: "Refresh draft",
      shortLabel: "Refresh",
      variant: "neutral",
      handler: "refresh-draft",
      instruction: refreshDraftInstruction(input.thread),
    }
  }

  if (awaitingReply) {
    if (replyActionsBlocked(input)) return null

    return {
      id: "draft-reply",
      label: "Draft reply",
      shortLabel: "Draft",
      variant: "neutral",
      handler: "draft-reply",
      instruction: "draft a reply",
    }
  }

  return null
}

export function planMessagesFromTicketMessages(
  messages: { id: string; sender: string }[],
): PlanThreadMessage[] {
  return messages.map(message => ({
    id: message.id,
    senderType: message.sender,
  }))
}
