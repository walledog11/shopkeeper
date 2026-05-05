"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { useFillerPhrase } from "@/hooks/useFillerPhrase"
import { useThreadPresence } from "@/hooks/useThreadPresence"
import { useConversationAgentFlow } from "../../_hooks/useConversationAgentFlow"
import ConversationHeader from "./ConversationHeader"
import ConversationSummaryBar from "./ConversationSummaryBar"
import PresenceBanner from "./PresenceBanner"
import ChatTimeline from "./timeline/ChatTimeline"
import NotesTimeline from "./timeline/NotesTimeline"
import ConversationComposerArea from "./composer/ConversationComposerArea"
import ConversationTabs from "./ConversationTabs"
import { partitionConversationMessages } from "./utils/conversationViewUtils"
import { useVisualKeyboard } from "./useVisualKeyboard"
import type { Ticket, AgentTurn, AgentPlan, FailedMessage } from "@/types"

interface Props {
  ticket: Ticket
  isThreadLoading?: boolean
  activeTab: 'open' | 'closed'
  agentName: string
  shopifyCustomerId?: string | null
  customerPlatformId?: string
  replyText: string
  isSending: boolean
  sendError: string | null
  messagesEndRef: RefObject<HTMLDivElement | null>
  agentTurns: AgentTurn[]
  isAgentRunning: boolean
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
  isSummaryRefreshing: boolean
  onRefreshSummary: () => void
  failedMessages?: FailedMessage[]
  onRetry?: (id: string) => void
}

export default function ConversationView({
  ticket,
  isThreadLoading = false,
  activeTab,
  agentName,
  shopifyCustomerId,
  customerPlatformId,
  replyText,
  isSending,
  sendError,
  messagesEndRef,
  agentTurns,
  isAgentRunning,
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
  isSummaryRefreshing,
  onRefreshSummary,
  failedMessages = [],
  onRetry,
}: Props) {
  const [viewTab, setViewTab] = useState<'chat' | 'notes'>('chat')
  const conversationRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const [composerHeight, setComposerHeight] = useState(0)
  const { keyboardInset, visualViewportHeight } = useVisualKeyboard(conversationRef, activeTab === 'open')
  const keyboardLayoutOpen = keyboardInset > 0

  const { displayMessages, noteCount } = partitionConversationMessages(ticket.messages, viewTab)
  const {
    clerkInstruction,
    handlePlanApprove,
    handlePlanDismiss,
    handlePlanRegenerate,
    handleSend,
    isClerkMode,
    isPlanExecuting,
    isPlanLoading,
    isRegenerating,
    pendingInstruction,
    pendingPlan,
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
    "--ticket-composer-height": `${composerHeight}px`,
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

  useEffect(() => {
    if (activeTab !== 'open') {
      setComposerHeight(0)
      return
    }

    const element = composerRef.current
    if (!element) return

    const updateHeight = () => {
      setComposerHeight(Math.ceil(element.getBoundingClientRect().height))
    }

    updateHeight()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeight)
      return () => window.removeEventListener("resize", updateHeight)
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)

    return () => observer.disconnect()
  }, [activeTab])

  useEffect(() => {
    if (!keyboardLayoutOpen) return

    const settleScroll = () => scrollTimelineToEnd("smooth")
    const first = window.setTimeout(settleScroll, 50)
    const second = window.setTimeout(settleScroll, 300)

    return () => {
      window.clearTimeout(first)
      window.clearTimeout(second)
    }
  }, [
    composerHeight,
    displayMessages.length,
    failedMessages.length,
    keyboardInset,
    keyboardLayoutOpen,
    replyText,
    scrollTimelineToEnd,
    viewTab,
    visualViewportHeight,
  ])

  useEffect(() => {
    const root = document.documentElement

    if (keyboardLayoutOpen) {
      root.dataset.mobileTicketEditing = "true"
    } else if (root.dataset.mobileTicketEditing === "true") {
      delete root.dataset.mobileTicketEditing
    }

    return () => {
      if (root.dataset.mobileTicketEditing === "true") {
        delete root.dataset.mobileTicketEditing
      }
    }
  }, [keyboardLayoutOpen])

  return (
    <div
      ref={conversationRef}
      data-keyboard-open={keyboardLayoutOpen ? "true" : "false"}
      data-testid="ticket-conversation"
      className="mobile-ticket-conversation flex-1 flex flex-col min-w-0 min-h-0 bg-background"
      style={conversationStyle}
    >
      {isThreadLoading ? (
        <>
          <div className="h-14 border-b border-border flex items-center justify-between px-3 md:px-6 shrink-0">
            <div className="min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-36 max-w-[60vw] bg-white/[0.08]" />
              <Skeleton className="h-3 w-20 bg-white/[0.06]" />
            </div>
            <Skeleton className="h-8 w-24 bg-white/[0.08]" />
          </div>

          <div className="shrink-0 border-b border-border bg-[#050505] px-2 py-1 mt-1 md:px-6">
            <div className="flex min-w-0 items-start justify-between gap-3 py-1">
              <div className="flex min-w-0 items-start gap-2 flex-1">
                <Skeleton className="h-5 w-5 rounded-md bg-white/[0.08]" />
                <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                  <Skeleton className="h-3 w-24 bg-white/[0.08]" />
                  <Skeleton className="h-3 w-full max-w-[420px] bg-white/[0.05]" />
                </div>
              </div>
              <Skeleton className="h-5 w-5 rounded bg-white/[0.06]" />
            </div>
          </div>

          {activeTab === 'closed' && (
            <div className="px-4 py-2 border-b border-border bg-background shrink-0">
              <Skeleton className="h-8 w-44 bg-white/[0.08]" />
            </div>
          )}

          <div className="mobile-ticket-timeline flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 bg-background">
            <div className="max-w-[75%] space-y-2">
              <Skeleton className="h-3 w-16 bg-white/[0.07]" />
              <Skeleton className="h-3 w-56 max-w-full bg-white/[0.06]" />
              <Skeleton className="h-3 w-40 max-w-full bg-white/[0.05]" />
            </div>
            <div className="ml-auto max-w-[70%] space-y-2">
              <Skeleton className="h-3 w-14 ml-auto bg-white/[0.07]" />
              <Skeleton className="h-3 w-52 max-w-full bg-white/[0.06]" />
            </div>
            <div className="max-w-[68%] space-y-2">
              <Skeleton className="h-3 w-20 bg-white/[0.07]" />
              <Skeleton className="h-3 w-48 max-w-full bg-white/[0.06]" />
              <Skeleton className="h-3 w-36 max-w-full bg-white/[0.05]" />
            </div>
          </div>

          {activeTab === 'open' && (
            <div className="mobile-ticket-composer-row relative z-20 shrink-0 flex flex-col">
              <div className="border-t border-border px-5 py-3 bg-background space-y-3">
                <Skeleton className="h-10 w-full bg-white/[0.06]" />
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-8 w-24 bg-white/[0.05]" />
                  <Skeleton className="h-8 w-20 bg-white/[0.08]" />
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <ConversationHeader
            activeTab={activeTab}
            customer={ticket.customer}
            platform={ticket.platform}
            onBack={onBack}
            onResolve={onResolve}
            onReopen={onReopen}
            onOpenContext={onOpenContext}
          />
          <ConversationSummaryBar
            summary={aiSummary}
            isRefreshing={isSummaryRefreshing}
            onRefresh={onRefreshSummary}
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
            {viewTab === 'notes' ? (
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
              />
            )}
          </div>

          {activeTab === 'open' && (
            <ConversationComposerArea
              containerRef={composerRef}
              agentName={agentName}
              clerkInstruction={clerkInstruction}
              isClerkMode={isClerkMode}
              isPlanExecuting={isPlanExecuting}
              isRegenerating={isRegenerating}
              noteCount={noteCount}
              onChange={text => onReplyChange(isClerkMode ? `@${agentName.toLowerCase()} ` + text : text)}
              onClearClerk={() => onReplyChange('')}
              onPlanApprove={handlePlanApprove}
              onPlanDismiss={handlePlanDismiss}
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
              }}
              viewTab={viewTab}
            />
          )}
        </>
      )}
    </div>
  )
}
