"use client"

import { useCallback, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type RefObject } from "react"
import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { NeedsYouCardBody, NeedsYouCardHeader } from "@/app/dashboard/_components/home/needs-you-card-ui"
import { cn } from "@/lib/ui/cn"
import { useFillerPhrase } from "@/hooks/useFillerPhrase"
import { useIsMobile } from "@/hooks/useMobile"
import { requestShopifyLinkFocus } from "@/lib/messaging/shopify-link-focus"
import { useConversationAgentFlow } from "../../_hooks/useConversationAgentFlow"
import { buildTicketCardMeta } from "../../_lib/inbox-row"
import ConversationHeader from "./ConversationHeader"
import ConversationContextBar from "./ConversationContextBar"
import type { ConversationContextSection } from "./conversation-context-panels"
import ChatTimeline from "./timeline/ChatTimeline"
import NotesTimeline from "./timeline/NotesTimeline"
import ConversationComposerArea from "./composer/ConversationComposerArea"
import ConversationTabs from "./ConversationTabs"
import { ComposerSkeleton, TimelineSkeleton } from "./ConversationSkeletons"
import { partitionConversationMessages } from "./utils/conversationViewUtils"
import { useConversationCocoAction } from "./useConversationCocoAction"
import { useConversationViewportEffects } from "./useConversationViewportEffects"
import { useVisualKeyboard } from "./useVisualKeyboard"
import type { Ticket, AgentTurn, AgentPlan, FailedMessage, OrgSettings, PlanExecutionOutcome, Thread } from "@/types"

interface Props {
  ticket: Ticket
  activeTab: 'open' | 'closed'
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
  const [openContextSection, setOpenContextSection] = useState<ConversationContextSection | null>(null)
  const isMobile = useIsMobile()
  const conversationRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const planCardRef = useRef<HTMLDivElement>(null)
  const { keyboardInset, visualViewportHeight } = useVisualKeyboard(conversationRef, activeTab === 'open')
  const keyboardLayoutOpen = keyboardInset > 0

  const handleFocusShopifyLink = useCallback(() => {
    setOpenContextSection("customer")
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
    planExecutionOutcome,
    requestDraftReply,
    requestRefreshDraft,
  } = useConversationAgentFlow({
    ticket,
    viewTab,
    replyText,
    initialPlan,
    onReplyChange,
    onSend,
    onAgentTurnAdd,
    onAgentRunningChange,
    onAgentComplete,
    onPrivateAnswerStart: () => setViewTab('notes'),
    onNoteModeReset: () => setViewTab('chat'),
    onPlanCacheUpdated: onTicketRefresh,
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

  const headerMeta = useMemo(
    () => buildTicketCardMeta(ticket),
    [ticket],
  )

  const focusPlanCard = useCallback(() => {
    setViewTab("chat")
    requestAnimationFrame(() => {
      planCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }, [])

  const { cocoAction: headerCocoAction, handleCocoAction } = useConversationCocoAction({
    activeTab,
    agentBusy,
    focusPlanCard,
    hasShopify,
    onActionError,
    onFocusShopifyLink: handleFocusShopifyLink,
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
  })

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
      <NeedsYouCardHeader className="shrink-0 pb-3.5 sm:pb-4">
        <div className="flex flex-col gap-2">
          <ConversationHeader
            activeTab={activeTab}
            cocoAction={headerCocoAction}
            meta={headerMeta}
            onCocoAction={() => { void handleCocoAction() }}
            onBack={onBack}
            onResolve={onResolve}
            onReopen={onReopen}
            onOpenContext={thread ? () => setOpenContextSection("customer") : undefined}
            embedded={embedded}
            flush
          />
          {thread && onLinkShopifyCustomer && (
            <ConversationContextBar
              thread={thread}
              hasShopify={hasShopify}
              onLinkShopifyCustomer={onLinkShopifyCustomer}
              openSection={openContextSection}
              onOpenSectionChange={setOpenContextSection}
              flush
            />
          )}
        </div>
      </NeedsYouCardHeader>

      {activeTab === 'closed' && (
        <ConversationTabs noteCount={noteCount} value={viewTab} onValueChange={setViewTab} />
      )}

      <ConversationTimelinePanel
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
          isAgentMode,
          isPlanExecuting,
          isPlanLoading,
          isRegenerating,
          pendingPlan,
          planExecutionOutcome,
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
    isAgentMode: boolean
    isPlanExecuting: boolean
    isPlanLoading: boolean
    isRegenerating: boolean
    pendingPlan: AgentPlan | null
    planExecutionOutcome: PlanExecutionOutcome | null
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
      agentInstruction={agent.agentInstruction}
      isAgentMode={agent.isAgentMode}
      isPlanExecuting={agent.isPlanExecuting}
      isRegenerating={agent.isRegenerating}
      noteCount={noteCount}
      onChange={text => handlers.onReplyChange(
        agent.isAgentMode ? `@${AGENT_DISPLAY_NAME.toLowerCase()} ` + text : text,
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
      planExecutionOutcome={agent.planExecutionOutcome}
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
    <NeedsYouCardBody
      ref={timelineRef}
      className={cn(
        "mobile-ticket-timeline overflow-y-auto custom-scrollbar transition-colors",
        status.viewTab === "notes" ? "bg-amber-500/[0.03]" : "",
      )}
    >
      <div
        data-testid={status.viewTab === "notes" ? "notes-timeline" : "chat-timeline"}
        data-thread-id={ticketId}
        className="flex min-h-full flex-col gap-3"
      >
        {status.isThreadLoading ? (
          <TimelineSkeleton />
        ) : status.viewTab === "notes" ? (
          <NotesTimeline
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
    </NeedsYouCardBody>
  )
}
