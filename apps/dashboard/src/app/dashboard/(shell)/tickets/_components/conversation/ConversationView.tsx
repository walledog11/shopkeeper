"use client"

import { useCallback, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type RefObject } from "react"
import { useFillerPhrase } from "@/hooks/useFillerPhrase"
import { useIsMobile } from "@/hooks/useMobile"
import { useThreadPresence } from "@/hooks/useThreadPresence"
import { requestShopifyLinkFocus } from "@/lib/messaging/shopify-link-focus"
import { quickApproveCachedPlan } from "../../_hooks/conversation-agent-requests"
import { useConversationAgentFlow } from "../../_hooks/useConversationAgentFlow"
import {
  planMessagesFromTicketMessages,
  resolveTicketCocoAction,
} from "../../_lib/resolve-ticket-coco-action"
import ConversationHeader from "./ConversationHeader"
import ConversationContextBar from "./ConversationContextBar"
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
  thread?: Thread | null
  onLinkShopifyCustomer?: (customerId: string | null) => Promise<void>
  failedMessages?: FailedMessage[]
  onRetry?: (id: string) => void
  onRetrySend?: (id: string) => void
  onTicketRefresh?: () => void | Promise<void>
  onActionError?: (message: string) => void
  embedded?: boolean
}

const EMPTY_FAILED_MESSAGES: FailedMessage[] = []
type ConversationDisplayMessages = ReturnType<typeof partitionConversationMessages>["displayMessages"]
type ConversationComposerAreaProps = ComponentProps<typeof ConversationComposerArea>

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
  thread,
  onLinkShopifyCustomer,
  failedMessages = EMPTY_FAILED_MESSAGES,
  onRetry,
  onRetrySend,
  onTicketRefresh,
  onActionError,
  embedded = false,
}: Props) {
  const {
    threadLoading: isThreadLoading = false,
    sending: isSending,
    agentRunning: isAgentRunning,
  } = status
  const [viewTab, setViewTab] = useState<'chat' | 'notes'>('chat')
  const [contextExpanded, setContextExpanded] = useState(false)
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
    setContextExpanded(true)
    requestAnimationFrame(() => requestShopifyLinkFocus())
  }, [])

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      composerRef.current
        ?.querySelector<HTMLTextAreaElement>('[data-testid="reply-composer-textarea"]')
        ?.focus()
    })
  }, [])

  const handleMerchantAnswered = useCallback(() => {
    void onTicketRefresh?.()
  }, [onTicketRefresh])

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
        onOpenContext={thread ? () => setContextExpanded(true) : undefined}
        embedded={embedded}
      />
      {thread && onLinkShopifyCustomer && (
        <div className="shrink-0 px-3 pt-3 md:px-5 md:pt-4">
          <ConversationContextBar
            thread={thread}
            hasShopify={hasShopify}
            onLinkShopifyCustomer={onLinkShopifyCustomer}
            expanded={contextExpanded}
            onExpandedChange={setContextExpanded}
          />
        </div>
      )}

      {activeTab === 'closed' && (
        <ConversationTabs noteCount={noteCount} value={viewTab} onValueChange={setViewTab} />
      )}
      <PresenceBanner presenceCount={presenceCount} />

      <ConversationTimelinePanel
        agentName={agentName}
        agentTurns={agentTurns}
        failedMessages={failedMessages}
        messages={displayMessages}
        messagesEndRef={messagesEndRef}
        onRetry={onRetry}
        onRetrySend={onRetrySend}
        pendingInstruction={pendingInstruction}
        planPhrase={planPhrase}
        runPhrase={runPhrase}
        status={{
          isAgentRunning,
          isPlanLoading,
          isThreadLoading,
          viewTab,
        }}
        ticketId={ticket.id}
        timelineRef={timelineRef}
      />

      <ConversationOpenComposer
        activeTab={activeTab}
        threadId={ticket.id}
        onAnswered={handleMerchantAnswered}
        agent={{
          agentInstruction,
          agentName,
          isAgentMode,
          isPlanExecuting,
          isPlanLoading,
          isRegenerating,
          pendingPlan,
        }}
        composerRef={composerRef}
        customer={{
          channelType: ticket.channelType,
          customerName: ticket.customer,
          customerPlatformId,
          lastCustomerMessageAt: ticket.lastCustomerMessageAt,
          shopifyCustomerId,
        }}
        handlers={{
          focusComposer,
          handleFocusShopifyLink,
          handlePlanApprove,
          handlePlanDismiss,
          handlePlanEdit,
          handlePlanRegenerate,
          handleSend,
          onReplyChange,
          setViewTab,
        }}
        isMobile={isMobile}
        isThreadLoading={isThreadLoading}
        noteCount={noteCount}
        planCardRef={planCardRef}
        reply={{
          isSending,
          replyText,
          sendError,
          isAgentRunning,
        }}
        viewTab={viewTab}
      />
    </div>
  )
}

interface ConversationOpenComposerProps {
  activeTab: Props["activeTab"]
  threadId: string
  onAnswered: (result?: { saveToKb: boolean }) => void
  agent: {
    agentInstruction: string
    agentName: string
    isAgentMode: boolean
    isPlanExecuting: boolean
    isPlanLoading: boolean
    isRegenerating: boolean
    pendingPlan: AgentPlan | null
  }
  composerRef: RefObject<HTMLDivElement | null>
  customer: {
    channelType: Ticket["channelType"]
    customerName: string
    customerPlatformId?: string
    lastCustomerMessageAt: string | null
    shopifyCustomerId?: string | null
  }
  handlers: {
    focusComposer: () => void
    handleFocusShopifyLink: () => void
    handlePlanApprove: ConversationComposerAreaProps["onPlanApprove"]
    handlePlanDismiss: NonNullable<ConversationComposerAreaProps["onPlanDismiss"]>
    handlePlanEdit: () => void
    handlePlanRegenerate: ConversationComposerAreaProps["onPlanRegenerate"]
    handleSend: ConversationComposerAreaProps["onSend"]
    onReplyChange: Props["onReplyChange"]
    setViewTab: ConversationComposerAreaProps["onViewTabChange"]
  }
  isMobile: boolean
  isThreadLoading: boolean
  noteCount: number
  planCardRef: RefObject<HTMLDivElement | null>
  reply: {
    isAgentRunning: boolean
    isSending: boolean
    replyText: string
    sendError: string | null
  }
  viewTab: "chat" | "notes"
}

function ConversationOpenComposer({
  activeTab,
  threadId,
  onAnswered,
  agent,
  composerRef,
  customer,
  handlers,
  isMobile,
  isThreadLoading,
  noteCount,
  planCardRef,
  reply,
  viewTab,
}: ConversationOpenComposerProps) {
  if (activeTab !== "open") return null
  if (isThreadLoading) return <ComposerSkeleton />

  return (
    <ConversationComposerArea
      containerRef={composerRef}
      planCardRef={planCardRef}
      threadId={threadId}
      onAnswered={onAnswered}
      agentName={agent.agentName}
      agentInstruction={agent.agentInstruction}
      isAgentMode={agent.isAgentMode}
      isPlanExecuting={agent.isPlanExecuting}
      isRegenerating={agent.isRegenerating}
      noteCount={noteCount}
      onChange={text => handlers.onReplyChange(
        agent.isAgentMode ? `@${agent.agentName.toLowerCase()} ` + text : text,
      )}
      onClearAgentMode={() => handlers.onReplyChange('')}
      onPlanApprove={handlers.handlePlanApprove}
      onPlanEdit={() => {
        handlers.handlePlanEdit()
        if (!isMobile) handlers.focusComposer()
      }}
      onPlanDismiss={handlers.handlePlanDismiss}
      onFocusShopifyLink={handlers.handleFocusShopifyLink}
      onPlanRegenerate={handlers.handlePlanRegenerate}
      onSend={handlers.handleSend}
      onViewTabChange={handlers.setViewTab}
      pendingPlan={agent.pendingPlan}
      composer={{
        customerName: customer.customerName,
        channelType: customer.channelType,
        customerPlatformId: customer.customerPlatformId,
        isSending: reply.isSending || reply.isAgentRunning || agent.isPlanLoading,
        replyText: reply.replyText,
        sendError: reply.sendError,
        shopifyCustomerId: customer.shopifyCustomerId,
        lastCustomerMessageAt: customer.lastCustomerMessageAt,
      }}
      viewTab={viewTab}
    />
  )
}

interface ConversationTimelinePanelProps {
  agentName: string
  agentTurns: AgentTurn[]
  failedMessages: FailedMessage[]
  messages: ConversationDisplayMessages
  messagesEndRef: RefObject<HTMLDivElement | null>
  onRetry?: (id: string) => void
  onRetrySend?: (id: string) => void
  pendingInstruction: string | null
  planPhrase: string
  runPhrase: string
  status: {
    isAgentRunning: boolean
    isPlanLoading: boolean
    isThreadLoading: boolean
    viewTab: "chat" | "notes"
  }
  ticketId: string
  timelineRef: RefObject<HTMLDivElement | null>
}

function ConversationTimelinePanel({
  agentName,
  agentTurns,
  failedMessages,
  messages,
  messagesEndRef,
  onRetry,
  onRetrySend,
  pendingInstruction,
  planPhrase,
  runPhrase,
  status,
  ticketId,
  timelineRef,
}: ConversationTimelinePanelProps) {
  return (
    <div
      ref={timelineRef}
      data-testid={status.viewTab === 'notes' ? 'notes-timeline' : 'chat-timeline'}
      data-thread-id={ticketId}
      className={`mobile-ticket-timeline flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 transition-colors ${
        status.viewTab === 'notes' ? 'bg-amber-500/[0.03]' : 'bg-background'
      }`}
    >
      {status.isThreadLoading ? (
        <TimelineSkeleton />
      ) : status.viewTab === 'notes' ? (
        <NotesTimeline
          agentName={agentName}
          agentTurns={agentTurns}
          isAgentRunning={status.isAgentRunning}
          isPlanLoading={status.isPlanLoading}
          messages={messages}
          pendingInstruction={pendingInstruction}
          planPhrase={planPhrase}
          runPhrase={runPhrase}
        />
      ) : (
        <ChatTimeline
          failedMessages={failedMessages}
          isAgentRunning={status.isAgentRunning}
          messages={messages}
          messagesEndRef={messagesEndRef}
          onRetry={onRetry}
          onRetrySend={onRetrySend}
        />
      )}
    </div>
  )
}
