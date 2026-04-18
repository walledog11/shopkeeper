"use client"

import { useState, type RefObject } from "react"
import { useFillerPhrase } from "@/hooks/useFillerPhrase"
import { useThreadPresence } from "@/hooks/useThreadPresence"
import { useConversationAgentFlow } from "@/hooks/useConversationAgentFlow"
import ConversationHeader from "./ConversationHeader"
import PresenceBanner from "./PresenceBanner"
import ChatTimeline from "./timeline/ChatTimeline"
import NotesTimeline from "./timeline/NotesTimeline"
import ConversationComposerArea from "./composer/ConversationComposerArea"
import ConversationTabs from "./ConversationTabs"
import { partitionConversationMessages } from "./utils/conversationViewUtils"
import type { Ticket, AgentTurn, AgentPlan, FailedMessage } from "@/types"

interface Props {
  ticket: Ticket
  activeTab: 'open' | 'closed'
  agentName: string
  shopifyCustomerId?: string | null
  customerPlatformId?: string
  replyText: string
  isDrafting: boolean
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
  onDraft: () => void
  onAgentComplete: (turn: AgentTurn) => void
  planRevisionKey?: string | null
  initialPlan?: AgentPlan | null
  onPlanCached: (plan: AgentPlan | null) => void
  onOpenContext?: () => void
  failedMessages?: FailedMessage[]
  onRetry?: (id: string) => void
}

export default function ConversationView({
  ticket,
  activeTab,
  agentName,
  shopifyCustomerId,
  customerPlatformId,
  replyText,
  isDrafting,
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
  onDraft,
  onAgentComplete,
  planRevisionKey,
  initialPlan,
  onPlanCached,
  onOpenContext,
  failedMessages = [],
  onRetry,
}: Props) {
  const [viewTab, setViewTab] = useState<'chat' | 'notes'>('chat')
  const [isNoteMode, setIsNoteMode] = useState(false)

  const { displayMessages, noteCount } = partitionConversationMessages(ticket.messages, viewTab)
  const {
    clerkInstruction,
    handlePlanApprove,
    handlePlanDismiss,
    handlePlanRegenerate,
    handleSend,
    isAutoPlanLoading,
    isClerkMode,
    isPlanExecuting,
    isPlanLoading,
    isRegenerating,
    pendingInstruction,
    pendingPlan,
  } = useConversationAgentFlow({
    activeTab,
    ticket,
    viewTab,
    replyText,
    agentName,
    planRevisionKey,
    initialPlan,
    onReplyChange,
    onSend,
    onAgentTurnAdd,
    onAgentRunningChange,
    onAgentComplete,
    onPlanCached,
    onNoteModeReset: () => setIsNoteMode(false),
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

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      <ConversationHeader
        activeTab={activeTab}
        customer={ticket.customer}
        platform={ticket.platform}
        onBack={onBack}
        onResolve={onResolve}
        onReopen={onReopen}
        onOpenContext={onOpenContext}
      />

      <ConversationTabs noteCount={noteCount} value={viewTab} onValueChange={setViewTab} />
      <PresenceBanner presenceCount={presenceCount} />

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 transition-colors ${
        viewTab === 'notes' ? 'bg-violet-500/[0.02]' : 'bg-background'
      }`}>
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
          agentName={agentName}
          clerkInstruction={clerkInstruction}
          isAutoPlanLoading={isAutoPlanLoading}
          isClerkMode={isClerkMode}
          isNoteMode={isNoteMode}
          isPlanExecuting={isPlanExecuting}
          isRegenerating={isRegenerating}
          onAddNote={() => setIsNoteMode(true)}
          onCancelNote={() => setIsNoteMode(false)}
          onChange={text => onReplyChange(isClerkMode ? `@${agentName.toLowerCase()} ` + text : text)}
          onClearClerk={() => onReplyChange('')}
          onPlanApprove={handlePlanApprove}
          onPlanDismiss={handlePlanDismiss}
          onPlanRegenerate={handlePlanRegenerate}
          onSend={handleSend}
          pendingPlan={pendingPlan}
          composer={{
            customerName: ticket.customer,
            channelType: ticket.channelType,
            customerPlatformId,
            isDrafting,
            isSending: isSending || isAgentRunning || isPlanLoading,
            onDraft,
            replyText,
            sendError,
            shopifyCustomerId,
          }}
          viewTab={viewTab}
        />
      )}
    </div>
  )
}
