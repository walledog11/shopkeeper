"use client"

import { useRef, type ComponentProps, type ReactNode } from "react"
import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { AlertCircle, CheckCircle2, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { Thread, Ticket } from "@/types"
import type { TicketToast } from "../_hooks/useTicketActions"
import { InboxControls } from "./stream/InboxControls"
import { InboxStream } from "./stream/InboxStream"
import { InboxStreamLoading } from "./stream/InboxStreamLoading"
import ConversationView from "./conversation/ConversationView"
import { ConversationBodySkeleton } from "./conversation/ConversationSkeletons"
import { ConversationLoadState } from "./TicketsPageStates"
import { dashboardPageShellClassName } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { needsYouCardShellClassName } from "@/app/dashboard/_components/home/needs-you-card-styles"
import { cn } from "@/lib/ui/cn"

type ConversationViewProps = ComponentProps<typeof ConversationView>

interface InboxPageLayoutFlags {
  correctReplyVisible: boolean
  hasMore: boolean
  hasShopify: boolean
  includeClosed: boolean
  isAgentRunning: boolean
  isConversationLoading: boolean
  isLoadingMore: boolean
  isSearchLoading: boolean
  isSearchMode: boolean
  isSending: boolean
  listLoading: boolean
}

interface InboxPageLayoutConversationState {
  activeAgentTurns: ConversationViewProps["agentTurns"]
  activeThread: Thread | undefined
  activeThreadError: unknown
  activeThreadPreview: Thread | undefined
  cachedPlan: ConversationViewProps["initialPlan"]
  conversationTicket: Ticket | undefined
  failedMessages: ConversationViewProps["failedMessages"]
  messagesEndRef: ConversationViewProps["messagesEndRef"]
  orgSettings?: ConversationViewProps["orgSettings"]
  replyText: string
  sendError: ConversationViewProps["sendError"]
  toast: TicketToast | null
}

interface InboxPageLayoutListState {
  activeTicketId: string | null
  approvingTicketId: string | null
  searchQuery: string
  spamTickets: Ticket[]
  tickets: Ticket[]
  totalCount: number
}

interface InboxPageLayoutActions {
  onAgentComplete: ConversationViewProps["onAgentComplete"]
  onAgentRunningChange: ConversationViewProps["onAgentRunningChange"]
  onAgentTurnAdd: ConversationViewProps["onAgentTurnAdd"]
  onBack: () => void
  onCorrectReplyDismiss: () => void
  onLinkShopifyCustomer: (customerId: string | null) => Promise<void>
  onLoadMore: () => void
  onNotReal: (id: string) => void
  onOpen: (id: string) => void
  onRecover: (id: string) => void
  onAnswered: () => void
  onReopen: ConversationViewProps["onReopen"]
  onReplyChange: ConversationViewProps["onReplyChange"]
  onResolve: ConversationViewProps["onResolve"]
  onRetry: ConversationViewProps["onRetry"]
  onRetrySend: ConversationViewProps["onRetrySend"]
  onReview: (id: string) => void
  onSearchChange: (value: string) => void
  onSend: (id: string) => void
  onSendMessage: ConversationViewProps["onSend"]
  onActionError: ConversationViewProps["onActionError"]
  onTicketRefresh: ConversationViewProps["onTicketRefresh"]
  onToggleClosed: () => void
  onTrust: (id: string) => void
}

interface InboxPageLayoutProps {
  actions: InboxPageLayoutActions
  conversation: InboxPageLayoutConversationState
  flags: InboxPageLayoutFlags
  list: InboxPageLayoutListState
}

function CorrectReplyBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-600/20 bg-amber-600/[0.08] px-4 py-2 text-xs text-amber-700 shrink-0">
      <span>Send the reply you&apos;d prefer — {AGENT_DISPLAY_NAME} will learn from the difference.</span>
      <button
        type="button"
        onClick={onDismiss}
        className="inline-flex items-center gap-1 text-amber-700/70 hover:text-amber-700 transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function TicketConversation({
  actions,
  conversation,
  conversationTab,
  flags,
}: {
  actions: InboxPageLayoutActions
  conversation: InboxPageLayoutConversationState
  conversationTab: ConversationViewProps["activeTab"]
  flags: InboxPageLayoutFlags
}) {
  const { activeThread, conversationTicket } = conversation
  if (!conversationTicket) return null

  return (
    <ConversationView
      key={conversationTicket.id}
      ticket={conversationTicket}
      hasShopify={flags.hasShopify}
      orgSettings={conversation.orgSettings}
      threadContext={activeThread ? {
        cachedPlan: activeThread.cachedPlan,
        cachedPlanMessageId: activeThread.cachedPlanMessageId,
      } : null}
      shopifyCustomerId={activeThread?.shopifyCustomerId}
      customerPlatformId={activeThread?.customer?.platformId}
      agentTurns={conversation.activeAgentTurns}
      status={{
        threadLoading: flags.isConversationLoading,
        sending: flags.isSending,
        agentRunning: flags.isAgentRunning,
      }}
      onAgentTurnAdd={actions.onAgentTurnAdd}
      onAgentRunningChange={actions.onAgentRunningChange}
      onAgentComplete={actions.onAgentComplete}
      activeTab={conversationTab}
      initialPlan={conversation.cachedPlan}
      replyText={conversation.replyText}
      sendError={conversation.sendError}
      messagesEndRef={conversation.messagesEndRef}
      failedMessages={conversation.failedMessages}
      onRetry={actions.onRetry}
      onRetrySend={actions.onRetrySend}
      onTicketRefresh={actions.onTicketRefresh}
      onActionError={actions.onActionError}
      thread={activeThread ?? null}
      onLinkShopifyCustomer={actions.onLinkShopifyCustomer}
      onBack={actions.onBack}
      onResolve={actions.onResolve}
      onReopen={actions.onReopen}
      onReplyChange={actions.onReplyChange}
      onSend={actions.onSendMessage}
      embedded
    />
  )
}

export function InboxPageLayout({
  actions,
  conversation,
  flags,
  list,
}: InboxPageLayoutProps) {
  const {
    activeThread,
    activeThreadError,
    activeThreadPreview,
    conversationTicket,
    orgSettings,
    toast,
  } = conversation
  const { activeTicketId, approvingTicketId, searchQuery, spamTickets, tickets, totalCount } = list
  const lastDialogBodyRef = useRef<ReactNode>(null)

  const conversationTab = (activeThread?.status ?? activeThreadPreview?.status) === "closed"
    ? "closed"
    : "open"
  const showConversation = Boolean(activeTicketId)

  const inlineConversationBody = activeTicketId ? (
    conversationTicket ? (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {flags.correctReplyVisible && <CorrectReplyBanner onDismiss={actions.onCorrectReplyDismiss} />}
        <TicketConversation
          actions={actions}
          conversation={conversation}
          conversationTab={conversationTab}
          flags={flags}
        />
      </div>
    ) : activeThreadError ? (
      <ConversationLoadState error={activeThreadError} compact />
    ) : (
      <ConversationBodySkeleton />
    )
  ) : null

  const dialogBody = showConversation ? (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {inlineConversationBody}
    </div>
  ) : null

  if (dialogBody) lastDialogBodyRef.current = dialogBody

  return (
    <div className="flex size-full flex-col overflow-hidden bg-background relative">
      <div className="custom-scrollbar flex-1 overflow-y-auto overflow-x-hidden">
        <div className={dashboardPageShellClassName()}>
          <InboxControls
            searchQuery={searchQuery}
            isSearchLoading={Boolean(flags.isSearchLoading && flags.isSearchMode)}
            includeClosed={flags.includeClosed}
            onSearchChange={actions.onSearchChange}
            onToggleClosed={actions.onToggleClosed}
          />

          {flags.listLoading ? (
            <InboxStreamLoading />
          ) : (
            <InboxStream
              tickets={tickets}
              spamTickets={spamTickets}
              orgSettings={orgSettings}
              approvingTicketId={approvingTicketId}
              isSearchMode={flags.isSearchMode}
              hasMore={flags.hasMore}
              isLoadingMore={flags.isLoadingMore}
              hasAnyConversation={totalCount > 0}
              onOpen={actions.onOpen}
              onSend={actions.onSend}
              onReview={actions.onReview}
              onTrust={actions.onTrust}
              onNotReal={actions.onNotReal}
              onRecover={actions.onRecover}
              onAnswered={actions.onAnswered}
              onLoadMore={actions.onLoadMore}
            />
          )}
        </div>
      </div>

      <Dialog open={showConversation} onOpenChange={open => { if (!open) actions.onBack() }}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-border bg-card p-0 pt-[env(safe-area-inset-top)] sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[86vh] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:pt-0 sm:max-w-3xl lg:max-w-5xl xl:max-w-6xl",
            needsYouCardShellClassName("shell"),
          )}
        >
          <DialogTitle className="sr-only">Conversation</DialogTitle>
          {lastDialogBodyRef.current}
        </DialogContent>
      </Dialog>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-foreground text-background text-sm font-medium px-4 py-2.5 rounded-full shadow-lg pointer-events-none">
          {toast.tone === "error"
            ? <AlertCircle className="size-4 text-red-600 shrink-0" />
            : <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          }
          {toast.message}
        </div>
      )}
    </div>
  )
}
