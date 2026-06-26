"use client"

import { useCallback, useMemo } from "react"
import { quickApproveCachedPlan } from "../../_hooks/conversation-agent-requests"
import {
  planMessagesFromTicketMessages,
  resolveTicketCocoAction,
} from "../../_lib/resolve-ticket-coco-action"
import type { AgentPlan, OrgSettings, Thread, Ticket } from "@/types"

interface UseConversationCocoActionProps {
  activeTab: "open" | "closed"
  agentBusy: boolean
  focusPlanCard: () => void
  hasShopify: boolean
  onActionError?: (message: string) => void
  onFocusShopifyLink: () => void
  onTicketRefresh?: () => void | Promise<void>
  orgSettings?: Partial<OrgSettings> | null
  pendingPlan: AgentPlan | null
  requestDraftReply: (instruction?: string) => Promise<void>
  requestRefreshDraft: (instruction?: string) => Promise<void>
  scrollTimelineToEnd: (behavior?: ScrollBehavior) => void
  shopifyCustomerId?: string | null
  threadContext?: Pick<Thread, "cachedPlan" | "cachedPlanMessageId"> | null
  ticket: Ticket
  viewTab: "chat" | "notes"
}

export function useConversationCocoAction({
  activeTab,
  agentBusy,
  focusPlanCard,
  hasShopify,
  onActionError,
  onFocusShopifyLink,
  onTicketRefresh,
  orgSettings,
  pendingPlan,
  requestDraftReply,
  requestRefreshDraft,
  scrollTimelineToEnd,
  shopifyCustomerId,
  threadContext,
  ticket,
  viewTab,
}: UseConversationCocoActionProps) {
  const planMessages = useMemo(
    () => planMessagesFromTicketMessages(ticket.messages),
    [ticket.messages],
  )

  const cocoAction = useMemo(() => resolveTicketCocoAction({
    activeTab,
    agentBusy,
    channelType: ticket.channelType,
    hasShopify,
    isNoteTab: viewTab === "notes",
    lastCustomerMessageAt: ticket.lastCustomerMessageAt,
    messages: planMessages,
    orgSettings,
    shopifyCustomerId,
    filterStatus: ticket.filterStatus,
    thread: threadContext,
  }), [
    activeTab,
    agentBusy,
    hasShopify,
    orgSettings,
    planMessages,
    shopifyCustomerId,
    threadContext,
    ticket.channelType,
    ticket.filterStatus,
    ticket.lastCustomerMessageAt,
    viewTab,
  ])

  const headerCocoAction = useMemo(() => {
    if (pendingPlan) return null
    if (cocoAction && (cocoAction.handler === "draft-reply" || cocoAction.handler === "refresh-draft")) {
      return { ...cocoAction, label: "Generate Plan", shortLabel: "Generate" }
    }
    return cocoAction
  }, [cocoAction, pendingPlan])

  const handleCocoAction = useCallback(async () => {
    if (!cocoAction || cocoAction.disabled) return

    switch (cocoAction.handler) {
      case "quick-approve": {
        const result = await quickApproveCachedPlan(ticket.id)
        if (!result.ok) {
          onActionError?.(result.error)
          return
        }
        await onTicketRefresh?.()
        scrollTimelineToEnd("smooth")
        return
      }
      case "focus-plan":
        focusPlanCard()
        return
      case "draft-reply":
        await requestDraftReply(cocoAction.instruction ?? "draft a reply")
        focusPlanCard()
        return
      case "refresh-draft":
        await requestRefreshDraft(cocoAction.instruction ?? "draft a reply")
        focusPlanCard()
        return
      case "link-customer":
        onFocusShopifyLink()
        return
    }
  }, [
    cocoAction,
    focusPlanCard,
    onActionError,
    onFocusShopifyLink,
    onTicketRefresh,
    requestDraftReply,
    requestRefreshDraft,
    scrollTimelineToEnd,
    ticket.id,
  ])

  return {
    cocoAction: headerCocoAction,
    handleCocoAction,
  }
}
