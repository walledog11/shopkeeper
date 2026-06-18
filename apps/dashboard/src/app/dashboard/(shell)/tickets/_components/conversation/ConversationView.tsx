"use client"

import { useCallback, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react"
import { useFillerPhrase } from "@/hooks/useFillerPhrase"
import { useIsMobile } from "@/hooks/useMobile"
import { useThreadPresence } from "@/hooks/useThreadPresence"
import { requestShopifyLinkFocus } from "@/lib/messaging/shopify-link-focus"
import { quickApproveCachedPlan } from "../../_hooks/conversation-agent-requests"
import { useConversationAgentFlow } from "../../_hooks/useConversationAgentFlow"
import { buildTicketBriefSummary } from "../../_lib/ticket-brief-summary"
import {
  planMessagesFromTicketMessages,
  resolveTicketCocoAction,
} from "../../_lib/resolve-ticket-coco-action"
import ConversationHeader from "./ConversationHeader"
import ConversationSummaryBar from "./ConversationSummaryBar"
import PresenceBanner from "./PresenceBanner"
import ChatTimeline from "./timeline/ChatTimeline"
import NotesTimeline from "./timeline/NotesTimeline"
import ConversationComposerArea from "./composer/ConversationComposerArea"
import ConversationTabs from "./ConversationTabs"
import { ComposerSkeleton, TimelineSkeleton } from "./ConversationSkeletons"
import { partitionConversationMessages } from "./utils/conversationViewUtils"
import { useConversationViewportEffects } from "./useConversationViewportEffects"
import { useVisualKeyboard } from "./useVisualKeyboard"
import type { Ticket, AgentTurn, AgentPlan, FailedMessage, OrgSettings, Thread } from "@/types"

interface Props {
  ticket: Ticket
  activeTab: 'open' | 'closed'
  agentName: string
  hasShopify?: boolean
  orgSettings?: Partial<OrgSettings> | null
  threadContext?: Pick<Thread, "cachedPlan" | "cachedPlanMessageId"> | null
  shopifyCustomerId?: string | null
  customerPlatformId?: string
  replyText: string
  sendError: string | null
  messagesEndRef: RefObject<HTMLDivElement | null>
  agentTurns: AgentTurn[]
  status: {
    threadLoading?: boolean
    sending: boolean
    agentRunning: boolean
    summaryRefreshing: boolean
  }
  onAgentTurnAdd: (turn: AgentTurn) => void
  onAgentRunningChange: (running: boolean) => void
  onBack: () => void
  onResolve: () => void
  onReopen: () => void
  onReplyChange: (text: string) => void
  onSend: (isNote: boolean) => void
  onAgentComplete: (turn: AgentTurn) => void
  initialPlan?: AgentPlan | null
  onOpenContext?: () => void
  aiSummary: string | null
  onRefreshSummary: () => void
  failedMessages?: FailedMessage[]
  onRetry?: (id: string) => void
  onRetrySend?: (id: string) => void
  onTicketRefresh?: () => void | Promise<void>
  onActionError?: (message: string) => void
  embedded?: boolean
  aiTitle?: string | null
}

const EMPTY_FAILED_MESSAGES: FailedMessage[] = []

export default function ConversationView({
  ticket,
  activeTab,
  agentName,
  hasShopify = false,
  orgSettings = null,
  threadContext = null,
  shopifyCustomerId,
  customerPlatformId,
  replyText,
  sendError,
  messagesEndRef,
  agentTurns,
  status,
  onAgentTurnAdd,
  onAgentRunningChange,
  onBack,
  onResolve,
  onReopen,
  onReplyChange,
  onSend,
  onAgentComplete,
  initialPlan,
  onOpenContext,
  aiSummary,
  onRefreshSummary,
  failedMessages = EMPTY_FAILED_MESSAGES,
  onRetry,
  onRetrySend,
  onTicketRefresh,
  onActionError,
  embedded = false,
  aiTitle,
}: Props) {
  const {
    threadLoading: isThreadLoading = false,
    sending: isSending,
    agentRunning: isAgentRunning,
    summaryRefreshing: isSummaryRefreshing,
  } = status
  const [viewTab, setViewTab] = useState<'chat' | 'notes'>('chat')
  const isMobile = useIsMobile()
  const conversationRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const planCardRef = useRef<HTMLDivElement>(null)
  const { keyboardInset, visualViewportHeight } = useVisualKeyboard(conversationRef, activeTab === 'open')
  const keyboardLayoutOpen = keyboardInset > 0
  const planMessages = useMemo(
    () => planMessagesFromTicketMessages(ticket.messages),
    [ticket.messages],
  )

  const handleFocusShopifyLink = useCallback(() => {
    onOpenContext?.()
    requestAnimationFrame(() => requestShopifyLinkFocus())
  }, [onOpenContext])

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      composerRef.current
        ?.querySelector<HTMLTextAreaElement>('[data-testid="reply-composer-textarea"]')
        ?.focus()
    })
  }, [])

  const { displayMessages, noteCount } = partitionConversationMessages(ticket.messages, viewTab)
  const {
    agentInstruction,
    handlePlanApprove,
    handlePlanEdit,
    handlePlanDismiss,
    handlePlanRegenerate,
    handleSend,
    isAgentMode,
    isPlanExecuting,
    isPlanLoading,
    isRegenerating,
    pendingInstruction,
    pendingPlan,
    requestDraftReply,
    requestRefreshDraft,
  } = useConversationAgentFlow({
    ticket,
    viewTab,
    replyText,
    agentName,
    initialPlan,
    onReplyChange,
    onSend,
    onAgentTurnAdd,
    onAgentRunningChange,
    onAgentComplete,
    onPrivateAnswerStart: () => setViewTab('notes'),
    onNoteModeReset: () => setViewTab('chat'),
  })

  const planPhrase = useFillerPhrase([
    'On it…',
    'Reading the room…',
    'Getting up to speed…',
    'Cooking up a plan…',
  ], isPlanLoading)

  const runPhrase = useFillerPhrase([
    'Making it happen…',
    'Doing the thing…',
    'Almost there…',
    'Just a sec…',
    'Finishing touches…',
  ], isAgentRunning)

  const { presenceCount } = useThreadPresence(ticket.id)
  const conversationStyle = {
    "--ticket-visual-viewport-height": `${visualViewportHeight}px`,
  } as CSSProperties

  const scrollTimelineToEnd = useCallback((behavior: ScrollBehavior = "smooth") => {
    const timeline = timelineRef.current
    if (timeline) {
      timeline.scrollTo({ top: timeline.scrollHeight, behavior })
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" })
  }, [messagesEndRef])

  const agentBusy = isSending || isAgentRunning || isPlanLoading || isPlanExecuting

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

  const summaryText = useMemo(
    () => buildTicketBriefSummary({
      ticket,
      aiSummary,
      aiTitle,
      plan: pendingPlan,
    }),
    [aiSummary, aiTitle, pendingPlan, ticket],
  )

  const focusPlanCard = useCallback(() => {
    setViewTab("chat")
    requestAnimationFrame(() => {
      planCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }, [])

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
        handleFocusShopifyLink()
        return
    }
  }, [
    cocoAction,
    focusPlanCard,
    handleFocusShopifyLink,
    onActionError,
    onTicketRefresh,
    requestDraftReply,
    requestRefreshDraft,
    scrollTimelineToEnd,
    ticket.id,
  ])

  useConversationViewportEffects({
    activeTab,
    composerRef,
    conversationRef,
    displayMessageCount: displayMessages.length,
    failedMessageCount: failedMessages.length,
    isMobile,
    keyboardInset,
    keyboardLayoutOpen,
    replyText,
    scrollTimelineToEnd,
    viewTab,
    visualViewportHeight,
  })

  return (
    <div
      ref={conversationRef}
      data-keyboard-open={keyboardLayoutOpen ? "true" : "false"}
      data-testid="ticket-conversation"
      data-embedded={embedded ? "true" : "false"}
      className={`mobile-ticket-conversation flex flex-col min-w-0 min-h-0 bg-background ${
        embedded ? "h-full" : "flex-1"
      }`}
      style={conversationStyle}
    >
      <ConversationHeader
        activeTab={activeTab}
        cocoAction={headerCocoAction}
        customer={ticket.customer}
        platform={ticket.platform}
        onCocoAction={() => { void handleCocoAction() }}
        onBack={onBack}
        onResolve={onResolve}
        onReopen={onReopen}
        onOpenContext={onOpenContext}
        embedded={embedded}
      />
      <ConversationSummaryBar
        summary={summaryText}
        isRefreshing={isSummaryRefreshing}
        onRefresh={onRefreshSummary}
        startCollapsed={isMobile && Boolean(pendingPlan)}
      />

      {activeTab === 'closed' && (
        <ConversationTabs noteCount={noteCount} value={viewTab} onValueChange={setViewTab} />
      )}
      <PresenceBanner presenceCount={presenceCount} />

      {/* Messages */}
      <div
        ref={timelineRef}
        data-testid={viewTab === 'notes' ? 'notes-timeline' : 'chat-timeline'}
        data-thread-id={ticket.id}
        className={`mobile-ticket-timeline flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 transition-colors ${
          viewTab === 'notes' ? 'bg-violet-500/[0.02]' : 'bg-background'
        }`}
      >
        {isThreadLoading ? (
          <TimelineSkeleton />
        ) : viewTab === 'notes' ? (
          <NotesTimeline
            agentName={agentName}
            agentTurns={agentTurns}
            isAgentRunning={isAgentRunning}
            isPlanLoading={isPlanLoading}
            messages={displayMessages}
            pendingInstruction={pendingInstruction}
            planPhrase={planPhrase}
            runPhrase={runPhrase}
          />
        ) : (
          <ChatTimeline
            failedMessages={failedMessages}
            isAgentRunning={isAgentRunning}
            messages={displayMessages}
            messagesEndRef={messagesEndRef}
            onRetry={onRetry}
            onRetrySend={onRetrySend}
          />
        )}
      </div>

      {activeTab === 'open' && (
        isThreadLoading ? (
          <ComposerSkeleton />
        ) : (
          <ConversationComposerArea
            containerRef={composerRef}
            planCardRef={planCardRef}
            agentName={agentName}
            agentInstruction={agentInstruction}
            isAgentMode={isAgentMode}
            isPlanExecuting={isPlanExecuting}
            isRegenerating={isRegenerating}
            noteCount={noteCount}
            onChange={text => onReplyChange(isAgentMode ? `@${agentName.toLowerCase()} ` + text : text)}
            onClearAgentMode={() => onReplyChange('')}
            onPlanApprove={handlePlanApprove}
            onPlanEdit={() => {
              handlePlanEdit()
              if (!isMobile) focusComposer()
            }}
            onPlanDismiss={handlePlanDismiss}
            onFocusShopifyLink={handleFocusShopifyLink}
            onPlanRegenerate={handlePlanRegenerate}
            onSend={handleSend}
            onViewTabChange={setViewTab}
            pendingPlan={pendingPlan}
            composer={{
              customerName: ticket.customer,
              channelType: ticket.channelType,
              customerPlatformId,
              isSending: isSending || isAgentRunning || isPlanLoading,
              replyText,
              sendError,
              shopifyCustomerId,
              lastCustomerMessageAt: ticket.lastCustomerMessageAt,
            }}
            viewTab={viewTab}
          />
        )
      )}
    </div>
  )
}
