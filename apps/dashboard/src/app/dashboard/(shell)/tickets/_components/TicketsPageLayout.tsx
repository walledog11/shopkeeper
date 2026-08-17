"use client"

import { useRef, type ComponentProps, type ReactNode } from "react"
import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { AlertCircle, CheckCircle2, ChevronRight, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { ChannelType, Thread, Ticket } from "@/types"
import type { TicketToast } from "../_hooks/useTicketActions"
import { ConversationArchive } from "./archive/ConversationArchive"
import { TicketFilteredQueue } from "./queue/TicketFilteredQueue"
import { TicketQueue } from "./queue/TicketQueue"
import { TicketQueueLoading } from "./queue/TicketQueueLoading"
import type { TicketListView, TicketQueueTierFilter, TicketTagFilter } from "./thread-list/constants"
import { viewToConversationTab as toConversationTab } from "./thread-list/constants"
import ConversationView from "./conversation/ConversationView"
import { ConversationBodySkeleton } from "./conversation/ConversationSkeletons"
import { ConversationLoadState } from "./TicketsPageStates"
import { dashboardPageShellClassName } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { needsYouCardShellClassName } from "@/app/dashboard/_components/home/needs-you-card-styles"
import { cn } from "@/lib/ui/cn"

type ConversationViewProps = ComponentProps<typeof ConversationView>
type ArchiveProps = ComponentProps<typeof ConversationArchive>

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
  tierFilter: TicketQueueTierFilter | null
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
  onClearSelection: ArchiveProps["onClearSelection"]
  onCorrectReplyDismiss: () => void
  onChannelFilterChange: ArchiveProps["onChannelFilterChange"]
  onTagFilterChange: ArchiveProps["onTagFilterChange"]
  onLinkShopifyCustomer: (customerId: string | null) => Promise<void>
  onLoadMore: () => void
  onMarkAsSpam: ArchiveProps["onMarkAsSpam"]
  onRecover: ArchiveProps["onRecover"]
  onQuickApproveFromList: (threadId: string) => void
  onReviewFromList: (threadId: string) => void
  onReopen: ConversationViewProps["onReopen"]
  onReplyChange: ConversationViewProps["onReplyChange"]
  onResolve: ConversationViewProps["onResolve"]
  onRetry: ConversationViewProps["onRetry"]
  onRetrySend: ConversationViewProps["onRetrySend"]
  onTicketRefresh: ConversationViewProps["onTicketRefresh"]
  onActionError: ConversationViewProps["onActionError"]
  onSearchChange: ArchiveProps["onSearchChange"]
  onSelectTicket: ArchiveProps["onSelectTicket"]
  onSend: ConversationViewProps["onSend"]
  onViewChange: ArchiveProps["onViewChange"]
  onBrowseQuietTier: (tier: TicketQueueTierFilter) => void
  onTierFilterChange: (tier: TicketQueueTierFilter | null) => void
  onViewSpam: ArchiveProps["onViewSpam"]
  onToggleSelect: ArchiveProps["onToggleSelect"]
}

interface TicketsPageLayoutProps {
  actions: TicketsPageLayoutActions
  conversation: TicketsPageLayoutConversationState
  filters: TicketsPageLayoutFilters
  flags: TicketsPageLayoutFlags
  list: TicketsPageLayoutListState
}

function CorrectReplyBanner({
  onDismiss,
}: {
  onDismiss: () => void
}) {
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

function QueueHeader({ onViewAll }: { onViewAll: () => void }) {
  // The nav bar already shows "Inbox" + the open count, so this row carries
  // only the affordance the nav bar lacks: a jump to the full history list.
  return (
    <div className="flex w-full justify-end">
      <button
        type="button"
        onClick={onViewAll}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        All conversations
        <ChevronRight className="size-4" aria-hidden />
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
    conversationTicket,
    orgSettings,
    toast,
  } = conversation
  const {
    activeTicketId,
    approvingTicketId,
    effectiveActiveView,
    filteredTickets,
    liveTicketCount,
    selectedIds,
    spamCount,
  } = list
  const {
    channelFilter,
    connectedChannels,
    searchQuery,
    tagFilter,
    tierFilter,
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
    onBrowseQuietTier,
    onTierFilterChange,
    onViewSpam,
    onToggleSelect,
  } = actions
  const lastDialogBodyRef = useRef<ReactNode>(null)

  const conversationTab = flags.isSearchMode || effectiveActiveView === "spam"
    ? ((activeThread?.status ?? activeThreadPreview?.status) === "closed" ? "closed" : "open")
    : toConversationTab(effectiveActiveView)

  const isForMe = !flags.isSearchMode && effectiveActiveView === "for_me"
  const filteredQueueMode = !flags.isSearchMode && effectiveActiveView === "spam"
    ? "spam" as const
    : !flags.isSearchMode && effectiveActiveView === "all_open" && tierFilter
      ? tierFilter
      : null
  const showConversation = Boolean(activeTicketId)

  const correctReplyBanner = flags.correctReplyVisible
    ? <CorrectReplyBanner onDismiss={onCorrectReplyDismiss} />
    : null

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
    ) : activeThreadError ? (
      <ConversationLoadState error={activeThreadError} compact />
    ) : (
      <ConversationBodySkeleton />
    )
  ) : null

  const toastNode = toast ? (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-foreground text-background text-sm font-medium px-4 py-2.5 rounded-full shadow-lg pointer-events-none">
      {toast.tone === 'error'
        ? <AlertCircle className="size-4 text-red-600 shrink-0" />
        : <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
      }
      {toast.message}
    </div>
  ) : null

  const dialogBody = showConversation ? (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {inlineConversationBody}
    </div>
  ) : null

  if (dialogBody) lastDialogBodyRef.current = dialogBody

  const ticketDialog = (
    <Dialog open={showConversation} onOpenChange={open => { if (!open) onBack() }}>
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
  )

  return (
    <div className="flex size-full flex-col overflow-hidden bg-background relative">
      <div className="custom-scrollbar flex-1 overflow-y-auto overflow-x-hidden">
        <div className={dashboardPageShellClassName()}>
          {isForMe ? (
            <>
              <QueueHeader onViewAll={() => onViewChange("all_open")} />

              {flags.listLoading && !activeTicketId ? (
                <TicketQueueLoading />
              ) : (
                <TicketQueue
                  tickets={filteredTickets}
                  activeView={effectiveActiveView}
                  hasShopify={flags.hasShopify}
                  orgSettings={orgSettings}
                  activeTicketId={activeTicketId}
                  approvingTicketId={approvingTicketId}
                  onSelectTicket={onSelectTicket}
                  onQuickApprove={onQuickApproveFromList}
                  onReview={onReviewFromList}
                  onViewAll={() => onViewChange("all_open")}
                  onBrowseQuietTier={onBrowseQuietTier}
                />
              )}
            </>
          ) : filteredQueueMode ? (
            flags.listLoading && !activeTicketId ? (
              <TicketQueueLoading />
            ) : (
              <TicketFilteredQueue
                tickets={filteredTickets}
                mode={filteredQueueMode}
                activeView={effectiveActiveView}
                hasShopify={flags.hasShopify}
                orgSettings={orgSettings}
                activeTicketId={activeTicketId}
                approvingTicketId={approvingTicketId}
                onBack={() => onViewChange("for_me")}
                onSelectTicket={onSelectTicket}
                onQuickApprove={onQuickApproveFromList}
                onReview={onReviewFromList}
                onRecover={onRecover}
                onMarkAsSpam={onMarkAsSpam}
              />
            )
          ) : (
            <ConversationArchive
              tickets={filteredTickets}
              totalCount={liveTicketCount}
              activeView={effectiveActiveView}
              channelFilter={channelFilter}
              connectedChannels={connectedChannels}
              spamCount={spamCount}
              tagFilter={tagFilter}
              tierFilter={tierFilter}
              activeTicketId={activeTicketId}
              searchQuery={searchQuery}
              hasShopify={flags.hasShopify}
              orgSettings={orgSettings}
              approvingTicketId={approvingTicketId}
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
              onTierFilterChange={onTierFilterChange}
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
              onQuickApproveFromList={onQuickApproveFromList}
              onReviewFromList={onReviewFromList}
            />
          )}
        </div>
      </div>

      {ticketDialog}

      {toastNode}
    </div>
  )
}
