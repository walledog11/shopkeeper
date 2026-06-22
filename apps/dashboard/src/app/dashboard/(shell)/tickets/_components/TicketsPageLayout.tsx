"use client"

import { useRef, type ComponentProps, type ReactNode } from "react"
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Inbox, Info, Loader2, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { ChannelType, Thread, Ticket } from "@/types"
import type { TicketToast } from "../_hooks/useTicketActions"
import ThreadList from "./thread-list/ThreadList"
import { ThreadListHeader } from "./thread-list/ThreadListHeader"
import { TriageStackBoard } from "./board/TriageStackBoard"
import type { TicketListView, TicketTagFilter } from "./thread-list/constants"
import { viewToConversationTab as toConversationTab } from "./thread-list/constants"
import ConversationView from "./conversation/ConversationView"
import ContextPanel from "./context-panel/ContextPanel"
import ContextPanelSkeleton from "./context-panel/ContextPanelSkeleton"

type ConversationViewProps = ComponentProps<typeof ConversationView>
type ContextPanelProps = ComponentProps<typeof ContextPanel>
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
  refreshingSummaryId: string | null
  replyText: string
  sendError: ConversationViewProps["sendError"]
  toast: TicketToast | null
}

interface TicketsPageLayoutDrawerState {
  isDesktopContext: boolean
  showContextDrawer: boolean
}

interface TicketsPageLayoutFilters {
  channelFilter: ChannelType | null
  connectedChannels: ChannelType[]
  searchQuery: string
  tagFilter: TicketTagFilter | null
}

interface TicketsPageLayoutListState {
  activeTicketId: string | null
  activeView: TicketListView
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
  onLinkShopifyCustomer: ContextPanelProps["onLinkShopifyCustomer"]
  onLoadMore: () => void
  onMarkAsSpam: ThreadListProps["onMarkAsSpam"]
  onOpenContext: () => void
  onRecover: ThreadListProps["onRecover"]
  onQuickApproveFromList: (threadId: string) => void
  onReviewFromList: (threadId: string) => void
  onRefreshSummary: () => void
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
  onShowContextDrawerChange: (open: boolean) => void
  onViewChange: ThreadListProps["onViewChange"]
  onViewSpam: ThreadListProps["onViewSpam"]
  onToggleSelect: ThreadListProps["onToggleSelect"]
}

interface TicketsPageLayoutProps {
  actions: TicketsPageLayoutActions
  conversation: TicketsPageLayoutConversationState
  drawer: TicketsPageLayoutDrawerState
  filters: TicketsPageLayoutFilters
  flags: TicketsPageLayoutFlags
  list: TicketsPageLayoutListState
}

export function TicketsPageLayout({
  actions,
  conversation,
  drawer,
  filters,
  flags,
  list,
}: TicketsPageLayoutProps) {
  const {
    activeAgentTurns,
    activeThread,
    activeThreadError,
    activeThreadPreview,
    agentName,
    cachedPlan,
    conversationTicket,
    failedMessages,
    messagesEndRef,
    orgSettings,
    refreshingSummaryId,
    replyText,
    sendError,
    toast,
  } = conversation
  const {
    activeTicketId,
    activeView,
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
  const { isDesktopContext, showContextDrawer } = drawer
  const {
    onAgentComplete,
    onAgentRunningChange,
    onAgentTurnAdd,
    onBack,
    onBulkArchive,
    onBulkClose,
    onBulkTag,
    onClearSelection,
    onCorrectReplyDismiss,
    onChannelFilterChange,
    onTagFilterChange,
    onLinkShopifyCustomer,
    onLoadMore,
    onMarkAsSpam,
    onOpenContext,
    onRecover,
    onQuickApproveFromList,
    onReviewFromList,
    onRefreshSummary,
    onReopen,
    onReplyChange,
    onResolve,
    onRetry,
    onRetrySend,
    onTicketRefresh,
    onActionError,
    onSearchChange,
    onSelectTicket,
    onSend,
    onShowContextDrawerChange,
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

  const correctReplyBanner = flags.correctReplyVisible ? (
    <div className="flex items-center justify-between gap-3 border-b border-amber-600/20 bg-amber-600/[0.08] px-4 py-2 text-xs text-amber-800 shrink-0">
      <span>Send the reply you&apos;d prefer — {agentName} will learn from the difference.</span>
      <button
        type="button"
        onClick={onCorrectReplyDismiss}
        className="inline-flex items-center gap-1 text-amber-700/70 hover:text-amber-900 transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  ) : null

  const renderConversationView = (embedded: boolean): ReactNode => {
    if (!conversationTicket) return null

    return (
      <ConversationView
        key={conversationTicket.id}
        ticket={conversationTicket}
        agentName={agentName}
        hasShopify={flags.hasShopify}
        orgSettings={orgSettings}
        threadContext={activeThread ? {
          cachedPlan: activeThread.cachedPlan,
          cachedPlanMessageId: activeThread.cachedPlanMessageId,
        } : null}
        shopifyCustomerId={activeThread?.shopifyCustomerId}
        customerPlatformId={activeThread?.customer?.platformId}
        agentTurns={activeAgentTurns}
        status={{
          threadLoading: flags.isConversationLoading,
          sending: flags.isSending,
          agentRunning: flags.isAgentRunning,
          summaryRefreshing: activeThread ? refreshingSummaryId === activeThread.id : false,
        }}
        onAgentTurnAdd={onAgentTurnAdd}
        onAgentRunningChange={onAgentRunningChange}
        onAgentComplete={onAgentComplete}
        activeTab={conversationTab}
        initialPlan={cachedPlan}
        aiSummary={activeThread?.aiSummary ?? activeThreadPreview?.aiSummary ?? null}
        aiTitle={activeThread?.aiTitle ?? activeThreadPreview?.aiTitle ?? conversationTicket.aiTitle ?? null}
        onRefreshSummary={onRefreshSummary}
        replyText={replyText}
        sendError={sendError}
        messagesEndRef={messagesEndRef}
        failedMessages={failedMessages}
        onRetry={onRetry}
        onRetrySend={onRetrySend}
        onTicketRefresh={onTicketRefresh}
        onActionError={onActionError}
        onOpenContext={onOpenContext}
        onBack={onBack}
        onResolve={onResolve}
        onReopen={onReopen}
        onReplyChange={onReplyChange}
        onSend={onSend}
        embedded={embedded}
      />
    )
  }

  const activeContextPanel = activeTicketId && !activeThreadError ? (
    activeThread && !flags.isConversationLoading ? (
      <ContextPanel
        thread={activeThread}
        hasShopify={flags.hasShopify}
        onLinkShopifyCustomer={onLinkShopifyCustomer}
      />
    ) : (
      <ContextPanelSkeleton hasShopify={flags.hasShopify} />
    )
  ) : null

  const conversationBody = conversationTicket ? (
    <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
      {correctReplyBanner}
      <div className="flex flex-1 min-w-0 overflow-hidden">
        {renderConversationView(false)}
        {isDesktopContext && (
          <div className="hidden xl:flex">
            {activeContextPanel}
          </div>
        )}
        {activeThread && !flags.isConversationLoading && (
          <Sheet open={showContextDrawer} onOpenChange={onShowContextDrawerChange}>
            <SheetContent
              side="bottom"
              className="xl:hidden max-h-[82vh] flex flex-col p-0 rounded-t-xl border-border gap-0"
            >
              <SheetHeader className="px-5 py-3 border-b border-border shrink-0">
                <SheetTitle className="text-sm font-semibold text-foreground/70 text-left">Customer Details</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto">
                <ContextPanel
                  thread={activeThread}
                  hasShopify={flags.hasShopify}
                  onLinkShopifyCustomer={onLinkShopifyCustomer}
                />
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  ) : null

  const inlineConversationBody = activeTicketId ? (
    conversationTicket ? (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {correctReplyBanner}
        {renderConversationView(true)}
      </div>
    ) : (
      <div
        data-testid="inline-ticket-conversation-state"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
      >
        {activeThreadError ? (
          <>
            <AlertCircle className="size-5 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-foreground/70">Unable to load conversation</p>
              <p className="mt-1 text-xs text-foreground/40">It may have been archived or is no longer available.</p>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="size-5 animate-spin text-foreground/30" />
            <p className="text-sm font-semibold text-foreground/50">Loading conversation</p>
          </>
        )}
      </div>
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
      {inlineConversationBody}
      {activeContextPanel && (
        <>
          <div className="border-t border-border xl:hidden">
            <button
              type="button"
              aria-expanded={showContextDrawer}
              onClick={() => onShowContextDrawerChange(!showContextDrawer)}
              className="flex h-11 w-full items-center justify-between gap-3 px-4 text-left text-xs font-semibold text-foreground/65 transition-colors hover:bg-foreground/[0.04] hover:text-foreground/85"
            >
              <span className="inline-flex items-center gap-2">
                <Info className="size-3.5" />
                Customer details
              </span>
              {showContextDrawer ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          </div>
          <div
            data-testid="inline-ticket-context"
            className={`${showContextDrawer ? "flex" : "hidden"} max-h-[45vh] min-h-0 shrink-0 flex-col overflow-y-auto border-t border-border xl:flex xl:max-h-none xl:w-[320px] xl:border-l xl:border-t-0`}
          >
            {activeContextPanel}
          </div>
        </>
      )}
    </div>
  ) : null

  if (dialogBody) lastDialogBodyRef.current = dialogBody

  const ticketDialog = (
    <Dialog open={Boolean(isBoardView && activeTicketId)} onOpenChange={open => { if (!open) onBack() }}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[86vh] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 shadow-xl sm:max-w-3xl lg:max-w-5xl xl:max-w-6xl"
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
        {conversationBody ?? (activeTicketId ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-background p-6 text-center gap-3">
            {activeThreadError ? (
              <>
                <AlertCircle className="size-5 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-foreground/70">Unable to load conversation</p>
                  <p className="text-xs text-foreground/40 mt-1">It may have been archived or is no longer available.</p>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-background p-6 text-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
              {allCaughtUp
                ? <CheckCircle2 className="size-5 text-foreground/40" />
                : <Inbox className="size-5 text-foreground/30" />
              }
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-foreground">
                {allCaughtUp ? "You're all caught up" : "Pick a conversation"}
              </h2>
              <p className="text-sm text-foreground/50 max-w-[230px]">
                {allCaughtUp
                  ? `${agentName} will flag anything that needs your eye.`
                  : "Choose one from the list to jump in."}
              </p>
            </div>
          </div>
        ))}
      </div>

      {toastNode}
    </div>
  )
}
