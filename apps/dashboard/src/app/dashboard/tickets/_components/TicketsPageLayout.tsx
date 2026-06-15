"use client"

import type { ComponentProps } from "react"
import { AlertCircle, CheckCircle2, Inbox, X } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { ChannelType, Thread, Ticket } from "@/types"
import type { TicketToast } from "../_hooks/useTicketActions"
import ThreadList from "./thread-list/ThreadList"
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
  isDesktopContext: boolean
  isLoadingMore: boolean
  isSearchLoading: boolean
  isSearchMode: boolean
  isSending: boolean
  listLoading: boolean
  showContextDrawer: boolean
}

interface TicketsPageLayoutProps {
  activeAgentTurns: ConversationViewProps["agentTurns"]
  activeView: TicketListView
  effectiveActiveView: TicketListView
  channelFilter: ChannelType | null
  tagFilter: TicketTagFilter | null
  connectedChannels: ChannelType[]
  activeThread: Thread | undefined
  activeThreadError: unknown
  activeThreadPreview: Thread | undefined
  activeTicketId: string | null
  agentName: string
  cachedPlan: ConversationViewProps["initialPlan"]
  conversationTicket: Ticket | undefined
  failedMessages: ConversationViewProps["failedMessages"]
  orgSettings?: ConversationViewProps["orgSettings"]
  flags: TicketsPageLayoutFlags
  filteredTickets: Ticket[]
  liveTicketCount: number
  messagesEndRef: ConversationViewProps["messagesEndRef"]
  openThreadCount: number
  refreshingSummaryId: string | null
  replyText: string
  searchQuery: string
  selectedIds: string[]
  sendError: ConversationViewProps["sendError"]
  spamCount: number
  toast: TicketToast | null
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
  approvingTicketId: string | null
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

export function TicketsPageLayout({
  activeAgentTurns,
  activeView,
  effectiveActiveView,
  channelFilter,
  tagFilter,
  connectedChannels,
  activeThread,
  activeThreadError,
  activeThreadPreview,
  activeTicketId,
  agentName,
  cachedPlan,
  conversationTicket,
  failedMessages,
  orgSettings,
  flags,
  filteredTickets,
  liveTicketCount,
  messagesEndRef,
  openThreadCount,
  refreshingSummaryId,
  replyText,
  searchQuery,
  selectedIds,
  sendError,
  spamCount,
  toast,
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
  approvingTicketId,
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
}: TicketsPageLayoutProps) {
  const allCaughtUp = effectiveActiveView === "for_me" && openThreadCount === 0 && !flags.isSearchMode

  const conversationTab = flags.isSearchMode || effectiveActiveView === "spam"
    ? ((activeThread?.status ?? activeThreadPreview?.status) === "closed" ? "closed" : "open")
    : toConversationTab(effectiveActiveView)

  return (
    <div className="flex size-full overflow-hidden bg-background relative">
      <div className={`
        w-full md:w-72 md:min-w-[260px] md:max-w-[300px] shrink-0 border-r border-border flex-col bg-background
        ${activeTicketId ? 'hidden md:flex' : 'flex'}
      `}>
        <ThreadList
          tickets={filteredTickets}
          totalCount={liveTicketCount}
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
        {conversationTicket ? (
          <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
            {flags.correctReplyVisible && (
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
            )}
            <div className="flex flex-1 min-w-0 overflow-hidden">
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
              />
              {flags.isDesktopContext && (
                <div className="hidden xl:flex">
                  {activeThread && !flags.isConversationLoading ? (
                    <ContextPanel
                      thread={activeThread}
                      hasShopify={flags.hasShopify}
                      onLinkShopifyCustomer={onLinkShopifyCustomer}
                    />
                  ) : (
                    <ContextPanelSkeleton hasShopify={flags.hasShopify} />
                  )}
                </div>
              )}
              {activeThread && !flags.isConversationLoading && (
                <Sheet open={flags.showContextDrawer} onOpenChange={onShowContextDrawerChange}>
                  <SheetContent
                    side="bottom"
                    className="xl:hidden max-h-[82vh] flex flex-col p-0 rounded-t-xl border-border gap-0"
                  >
                    <SheetHeader className="px-5 py-3 border-b border-border shrink-0">
                      <SheetTitle className="text-sm font-semibold text-white/70 text-left">Customer Details</SheetTitle>
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
        ) : activeTicketId ? (
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
              <h2 className="font-display-serif text-lg text-foreground">
                {allCaughtUp ? "You’re all caught up" : "Pick a conversation"}
              </h2>
              <p className="text-sm text-foreground/50 max-w-[230px]">
                {allCaughtUp
                  ? `${agentName} will flag anything that needs your eye.`
                  : "Choose one from the list to jump in."}
              </p>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-foreground text-background text-sm font-medium px-4 py-2.5 rounded-full shadow-lg pointer-events-none">
          {toast.tone === 'error'
            ? <AlertCircle className="size-4 text-red-400 shrink-0" />
            : <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
          }
          {toast.message}
        </div>
      )}
    </div>
  )
}
