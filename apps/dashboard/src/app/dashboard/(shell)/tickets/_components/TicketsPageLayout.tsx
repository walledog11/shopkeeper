"use client"

import { useRef, type ComponentProps, type ReactNode } from "react"
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { ChannelType, Thread, Ticket } from "@/types"
import type { TicketToast } from "../_hooks/useTicketActions"
import ThreadList from "./thread-list/ThreadList"
import { ThreadListHeader } from "./thread-list/ThreadListHeader"
import { TriageStackBoard } from "./board/TriageStackBoard"
import type { TicketListView, TicketTagFilter } from "./thread-list/constants"
import { viewToConversationTab as toConversationTab } from "./thread-list/constants"
import ConversationView from "./conversation/ConversationView"
import {
  ConversationLoadState,
  NoConversationSelectedState,
} from "./TicketsPageStates"

type ConversationViewProps = ComponentProps<typeof ConversationView>
type ThreadListProps = ComponentProps<typeof ThreadList>

interface TicketsPageLayoutFlags {
  correctReplyVisible: boolean
  hasMore: boolean
  hasShopify: boolean
  isAgentRunning: boolean
  isConversationLoading: boolean
  isLoadingMore: boolean
  isSearchLoading: boolean
  isSearchMode: boolean
  isSending: boolean
  listLoading: boolean
}

interface TicketsPageLayoutConversationState {
  activeAgentTurns: ConversationViewProps["agentTurns"]
  activeThread: Thread | undefined
  activeThreadError: unknown
  activeThreadPreview: Thread | undefined
  agentName: string
  cachedPlan: ConversationViewProps["initialPlan"]
  conversationTicket: Ticket | undefined
  failedMessages: ConversationViewProps["failedMessages"]
  messagesEndRef: ConversationViewProps["messagesEndRef"]
  orgSettings?: ConversationViewProps["orgSettings"]
  replyText: string
  sendError: ConversationViewProps["sendError"]
  toast: TicketToast | null
}

interface TicketsPageLayoutFilters {
  channelFilter: ChannelType | null
  connectedChannels: ChannelType[]
  searchQuery: string
  tagFilter: TicketTagFilter | null
}

interface TicketsPageLayoutListState {
  activeTicketId: string | null
  approvingTicketId: string | null
  effectiveActiveView: TicketListView
  filteredTickets: Ticket[]
  forMeCount: number
  liveTicketCount: number
  openThreadCount: number
  selectedIds: string[]
  spamCount: number
}

interface TicketsPageLayoutActions {
  onAgentComplete: ConversationViewProps["onAgentComplete"]
  onAgentRunningChange: ConversationViewProps["onAgentRunningChange"]
  onAgentTurnAdd: ConversationViewProps["onAgentTurnAdd"]
  onBack: () => void
  onBulkArchive: () => void
  onBulkClose: () => void
  onBulkTag: (tag: string) => void
  onClearSelection: ThreadListProps["onClearSelection"]
  onCorrectReplyDismiss: () => void
  onChannelFilterChange: ThreadListProps["onChannelFilterChange"]
  onTagFilterChange: ThreadListProps["onTagFilterChange"]
  onLinkShopifyCustomer: (customerId: string | null) => Promise<void>
  onLoadMore: () => void
  onMarkAsSpam: ThreadListProps["onMarkAsSpam"]
  onRecover: ThreadListProps["onRecover"]
  onQuickApproveFromList: (threadId: string) => void
  onReviewFromList: (threadId: string) => void
  onReopen: ConversationViewProps["onReopen"]
  onReplyChange: ConversationViewProps["onReplyChange"]
  onResolve: ConversationViewProps["onResolve"]
  onRetry: ConversationViewProps["onRetry"]
  onRetrySend: ConversationViewProps["onRetrySend"]
  onTicketRefresh: ConversationViewProps["onTicketRefresh"]
  onActionError: ConversationViewProps["onActionError"]
  onSearchChange: ThreadListProps["onSearchChange"]
  onSelectTicket: ThreadListProps["onSelectTicket"]
  onSend: ConversationViewProps["onSend"]
  onViewChange: ThreadListProps["onViewChange"]
  onViewSpam: ThreadListProps["onViewSpam"]
  onToggleSelect: ThreadListProps["onToggleSelect"]
}

interface TicketsPageLayoutProps {
  actions: TicketsPageLayoutActions
  conversation: TicketsPageLayoutConversationState
  filters: TicketsPageLayoutFilters
  flags: TicketsPageLayoutFlags
  list: TicketsPageLayoutListState
}

function CorrectReplyBanner({
  agentName,
  onDismiss,
}: {
  agentName: string
  onDismiss: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-600/20 bg-amber-600/[0.08] px-4 py-2 text-xs text-amber-800 shrink-0">
      <span>Send the reply you&apos;d prefer — {agentName} will learn from the difference.</span>
      <button
        type="button"
        onClick={onDismiss}
        className="inline-flex items-center gap-1 text-amber-700/70 hover:text-amber-900 transition-colors shrink-0"
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
  embedded,
  flags,
}: {
  actions: TicketsPageLayoutActions
  conversation: TicketsPageLayoutConversationState
  conversationTab: ConversationViewProps["activeTab"]
  embedded: boolean
  flags: TicketsPageLayoutFlags
}) {
  const { activeThread, conversationTicket } = conversation
  if (!conversationTicket) return null

  return (
    <ConversationView
      key={conversationTicket.id}
      ticket={conversationTicket}
      agentName={conversation.agentName}
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
      onSend={actions.onSend}
      embedded={embedded}
    />
  )
}

export function TicketsPageLayout({
  actions,
  conversation,
  filters,
  flags,
  list,
}: TicketsPageLayoutProps) {
  const {
    activeThread,
    activeThreadError,
    activeThreadPreview,
    agentName,
    conversationTicket,
    orgSettings,
    toast,
  } = conversation
  const {
    activeTicketId,
    approvingTicketId,
    effectiveActiveView,
    filteredTickets,
    forMeCount,
    liveTicketCount,
    openThreadCount,
    selectedIds,
    spamCount,
  } = list
  const {
    channelFilter,
    connectedChannels,
    searchQuery,
    tagFilter,
  } = filters
  const {
    onBack,
    onBulkArchive,
    onBulkClose,
    onBulkTag,
    onClearSelection,
    onCorrectReplyDismiss,
    onChannelFilterChange,
    onTagFilterChange,
    onLoadMore,
    onMarkAsSpam,
    onRecover,
    onQuickApproveFromList,
    onReviewFromList,
    onSearchChange,
    onSelectTicket,
    onViewChange,
    onViewSpam,
    onToggleSelect,
  } = actions
  const lastDialogBodyRef = useRef<ReactNode>(null)
  const allCaughtUp = effectiveActiveView === "for_me" && openThreadCount === 0 && !flags.isSearchMode

  const conversationTab = flags.isSearchMode || effectiveActiveView === "spam"
    ? ((activeThread?.status ?? activeThreadPreview?.status) === "closed" ? "closed" : "open")
    : toConversationTab(effectiveActiveView)

  const isBoardView = !flags.isSearchMode
    && (effectiveActiveView === "for_me" || effectiveActiveView === "all_open" || effectiveActiveView === "closed")

  const correctReplyBanner = flags.correctReplyVisible
    ? <CorrectReplyBanner agentName={agentName} onDismiss={onCorrectReplyDismiss} />
    : null

  const conversationBody = conversationTicket ? (
    <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
      {correctReplyBanner}
      <TicketConversation
        actions={actions}
        conversation={conversation}
        conversationTab={conversationTab}
        embedded={false}
        flags={flags}
      />
    </div>
  ) : null

  const inlineConversationBody = activeTicketId ? (
    conversationTicket ? (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {correctReplyBanner}
        <TicketConversation
          actions={actions}
          conversation={conversation}
          conversationTab={conversationTab}
          embedded
          flags={flags}
        />
      </div>
    ) : (
      <ConversationLoadState error={activeThreadError} compact />
    )
  ) : null

  const toastNode = toast ? (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-foreground text-background text-sm font-medium px-4 py-2.5 rounded-full shadow-lg pointer-events-none">
      {toast.tone === 'error'
        ? <AlertCircle className="size-4 text-red-400 shrink-0" />
        : <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
      }
      {toast.message}
    </div>
  ) : null

  const dialogBody = isBoardView && activeTicketId ? (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {inlineConversationBody}
    </div>
  ) : null

  if (dialogBody) lastDialogBodyRef.current = dialogBody

  const ticketDialog = (
    <Dialog open={Boolean(isBoardView && activeTicketId)} onOpenChange={open => { if (!open) onBack() }}>
      <DialogContent
        showCloseButton={false}
        className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-border bg-background p-0 pt-[env(safe-area-inset-top)] shadow-xl sm:left-1/2 sm:top-1/2 sm:h-[86vh] sm:max-h-[86vh] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pt-0 sm:max-w-3xl lg:max-w-5xl xl:max-w-6xl"
      >
        <DialogTitle className="sr-only">Conversation</DialogTitle>
        {lastDialogBodyRef.current}
      </DialogContent>
    </Dialog>
  )

  if (isBoardView) {
    return (
      <div className="flex size-full flex-col overflow-hidden bg-background relative">
        <ThreadListHeader
          activeView={effectiveActiveView}
          channelFilter={channelFilter}
          connectedChannels={connectedChannels}
          forMeCount={forMeCount}
          spamCount={spamCount}
          tagFilter={tagFilter}
          hasSelection={false}
          isSearchLoading={flags.isSearchLoading}
          isSearchMode={flags.isSearchMode}
          searchQuery={searchQuery}
          selectedCount={0}
          onBulkArchive={onBulkArchive}
          onBulkClose={onBulkClose}
          onBulkTag={onBulkTag}
          onChannelFilterChange={onChannelFilterChange}
          onClearSelection={onClearSelection}
          onSearchChange={onSearchChange}
          onTagFilterChange={onTagFilterChange}
          onViewChange={onViewChange}
          onViewSpam={onViewSpam}
        />

        {flags.listLoading && !activeTicketId ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-foreground/30" />
          </div>
        ) : (
          <TriageStackBoard
            tickets={filteredTickets}
            activeView={effectiveActiveView}
            agentName={agentName}
            hasShopify={flags.hasShopify}
            orgSettings={orgSettings}
            activeTicketId={activeTicketId}
            approvingTicketId={approvingTicketId}
            onSelectTicket={onSelectTicket}
            onQuickApprove={onQuickApproveFromList}
            onReview={onReviewFromList}
          />
        )}

        {ticketDialog}

        {toastNode}
      </div>
    )
  }

  return (
    <div className="flex size-full overflow-hidden bg-background relative">
      <div className={`
        w-full md:w-72 md:min-w-[260px] md:max-w-[300px] shrink-0 border-r border-border flex-col bg-background
        ${activeTicketId ? 'hidden md:flex' : 'flex'}
      `}>
        <ThreadList
          tickets={filteredTickets}
          totalCount={liveTicketCount}
          forMeCount={forMeCount}
          activeView={effectiveActiveView}
          channelFilter={channelFilter}
          connectedChannels={connectedChannels}
          spamCount={spamCount}
          tagFilter={tagFilter}
          activeTicketId={activeTicketId}
          searchQuery={searchQuery}
          listState={{
            searchMode: flags.isSearchMode,
            searchLoading: flags.isSearchLoading,
            listLoading: flags.listLoading,
            hasMore: flags.hasMore,
            loadingMore: flags.isLoadingMore,
          }}
          selectedIds={selectedIds}
          onChannelFilterChange={onChannelFilterChange}
          onTagFilterChange={onTagFilterChange}
          onSearchChange={onSearchChange}
          onViewChange={onViewChange}
          onViewSpam={onViewSpam}
          onSelectTicket={onSelectTicket}
          onToggleSelect={onToggleSelect}
          onBulkClose={onBulkClose}
          onBulkArchive={onBulkArchive}
          onBulkTag={onBulkTag}
          onClearSelection={onClearSelection}
          onLoadMore={onLoadMore}
          onMarkAsSpam={onMarkAsSpam}
          onRecover={onRecover}
          hasShopify={flags.hasShopify}
          orgSettings={orgSettings}
          approvingTicketId={approvingTicketId}
          onQuickApproveFromList={onQuickApproveFromList}
          onReviewFromList={onReviewFromList}
        />
      </div>

      <div className={`flex-1 flex min-w-0 overflow-hidden ${!activeTicketId ? 'hidden md:flex' : 'flex'}`}>
        {conversationBody ?? (activeTicketId
          ? <ConversationLoadState error={activeThreadError} />
          : <NoConversationSelectedState agentName={agentName} allCaughtUp={allCaughtUp} />
        )}
      </div>

      {toastNode}
    </div>
  )
}
