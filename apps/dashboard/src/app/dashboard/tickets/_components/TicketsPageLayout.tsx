"use client"

import type { ComponentProps } from "react"
import { AlertCircle, CheckCircle2, Inbox, X } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { ChannelType, Thread, Ticket } from "@/types"
import type { TicketToast } from "../_hooks/useTicketActions"
import ThreadList from "./thread-list/ThreadList"
import ConversationView from "./conversation/ConversationView"
import ContextPanel from "./context-panel/ContextPanel"
import ContextPanelSkeleton from "./context-panel/ContextPanelSkeleton"

type TicketListTab = 'open' | 'closed' | 'filtered'
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
  needsReply: boolean
  showContextDrawer: boolean
}

interface TicketsPageLayoutProps {
  activeAgentTurns: ConversationViewProps["agentTurns"]
  activeFilter: ChannelType | null
  activeTab: TicketListTab
  activeThread: Thread | undefined
  activeThreadError: unknown
  activeThreadPreview: Thread | undefined
  activeTicketId: string | null
  agentName: string
  cachedPlan: ConversationViewProps["initialPlan"]
  closedCount: number
  conversationTicket: Ticket | undefined
  effectiveActiveTab: TicketListTab
  failedMessages: ConversationViewProps["failedMessages"]
  flags: TicketsPageLayoutFlags
  filteredTickets: Ticket[]
  liveTicketCount: number
  messagesEndRef: ConversationViewProps["messagesEndRef"]
  openCount: number
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
  onFilterChange: ThreadListProps["onFilterChange"]
  onLinkShopifyCustomer: ContextPanelProps["onLinkShopifyCustomer"]
  onLoadMore: () => void
  onMarkAsSpam: ThreadListProps["onMarkAsSpam"]
  onNeedsReplyChange: ThreadListProps["onNeedsReplyChange"]
  onOpenContext: () => void
  onRecover: ThreadListProps["onRecover"]
  onRefreshSummary: () => void
  onReopen: ConversationViewProps["onReopen"]
  onReplyChange: ConversationViewProps["onReplyChange"]
  onResolve: ConversationViewProps["onResolve"]
  onRetry: ConversationViewProps["onRetry"]
  onRetrySend: ConversationViewProps["onRetrySend"]
  onSearchChange: ThreadListProps["onSearchChange"]
  onSelectTicket: ThreadListProps["onSelectTicket"]
  onSend: ConversationViewProps["onSend"]
  onShowContextDrawerChange: (open: boolean) => void
  onTabChange: ThreadListProps["onTabChange"]
  onToggleSelect: ThreadListProps["onToggleSelect"]
}

export function TicketsPageLayout({
  activeAgentTurns,
  activeFilter,
  activeTab,
  activeThread,
  activeThreadError,
  activeThreadPreview,
  activeTicketId,
  agentName,
  cachedPlan,
  closedCount,
  conversationTicket,
  effectiveActiveTab,
  failedMessages,
  flags,
  filteredTickets,
  liveTicketCount,
  messagesEndRef,
  openCount,
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
  onFilterChange,
  onLinkShopifyCustomer,
  onLoadMore,
  onMarkAsSpam,
  onNeedsReplyChange,
  onOpenContext,
  onRecover,
  onRefreshSummary,
  onReopen,
  onReplyChange,
  onResolve,
  onRetry,
  onRetrySend,
  onSearchChange,
  onSelectTicket,
  onSend,
  onShowContextDrawerChange,
  onTabChange,
  onToggleSelect,
}: TicketsPageLayoutProps) {
  const allCaughtUp = effectiveActiveTab === 'open' && openThreadCount === 0

  return (
    <div className="flex size-full overflow-hidden bg-background relative">
      <div className={`
        w-full md:w-72 md:min-w-[260px] md:max-w-[300px] shrink-0 border-r border-border flex-col bg-background
        ${activeTicketId ? 'hidden md:flex' : 'flex'}
      `}>
        <ThreadList
          tickets={filteredTickets}
          totalCount={liveTicketCount}
          activeTab={effectiveActiveTab}
          activeFilter={activeFilter}
          activeTicketId={activeTicketId}
          openCount={openCount}
          closedCount={closedCount}
          spamCount={spamCount}
          searchQuery={searchQuery}
          listState={{
            searchMode: flags.isSearchMode,
            searchLoading: flags.isSearchLoading,
            hasMore: flags.hasMore,
            loadingMore: flags.isLoadingMore,
          }}
          selectedIds={selectedIds}
          needsReply={flags.needsReply}
          onNeedsReplyChange={onNeedsReplyChange}
          onSearchChange={onSearchChange}
          onTabChange={onTabChange}
          onFilterChange={onFilterChange}
          onSelectTicket={onSelectTicket}
          onToggleSelect={onToggleSelect}
          onBulkClose={onBulkClose}
          onBulkArchive={onBulkArchive}
          onBulkTag={onBulkTag}
          onClearSelection={onClearSelection}
          onLoadMore={onLoadMore}
          onMarkAsSpam={onMarkAsSpam}
          onRecover={onRecover}
        />
      </div>

      <div className={`flex-1 flex min-w-0 overflow-hidden ${!activeTicketId ? 'hidden md:flex' : 'flex'}`}>
        {conversationTicket ? (
          <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
            {flags.correctReplyVisible && (
              <div className="flex items-center justify-between gap-3 border-b border-amber-800/40 bg-amber-900/25 px-4 py-2 text-xs text-amber-100 shrink-0">
                <span>Send the reply you&apos;d prefer — {agentName} will learn from the difference.</span>
                <button
                  type="button"
                  onClick={onCorrectReplyDismiss}
                  className="inline-flex items-center gap-1 text-amber-200/80 hover:text-amber-50 transition-colors shrink-0"
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
                activeTab={flags.isSearchMode || effectiveActiveTab === 'filtered'
                  ? ((activeThread?.status ?? activeThreadPreview?.status) === 'closed' ? 'closed' : 'open')
                  : effectiveActiveTab}
                initialPlan={cachedPlan}
                aiSummary={activeThread?.aiSummary ?? activeThreadPreview?.aiSummary ?? null}
                onRefreshSummary={onRefreshSummary}
                replyText={replyText}
                sendError={sendError}
                messagesEndRef={messagesEndRef}
                failedMessages={failedMessages}
                onRetry={onRetry}
                onRetrySend={onRetrySend}
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
                <AlertCircle className="size-5 text-red-400" />
                <div>
                  <p className="text-sm font-semibold text-white/60">Unable to load ticket</p>
                  <p className="text-xs text-white/30 mt-1">The ticket may have been archived or is no longer available.</p>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-background p-6 text-center gap-4">
            <div className="size-14 rounded-md bg-white/[0.05] border border-border flex items-center justify-center">
              {allCaughtUp
                ? <CheckCircle2 className="size-6 text-green-400" />
                : <Inbox className="size-6 text-white/20" />
              }
            </div>
            <div>
              <p className="text-sm font-semibold text-white/60">
                {allCaughtUp ? 'All caught up' : 'No ticket open'}
              </p>
              <p className="text-xs text-white/30 mt-1 max-w-[200px]">
                {allCaughtUp
                  ? 'No open tickets right now. Check back soon.'
                  : 'Select a ticket from the list to start replying.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#1c1c1c] border border-white/[0.10] text-white text-sm font-medium px-4 py-2.5 rounded-md shadow-lg pointer-events-none">
          {toast.tone === 'error'
            ? <AlertCircle className="size-4 text-red-400 shrink-0" />
            : <CheckCircle2 className="size-4 text-green-400 shrink-0" />
          }
          {toast.message}
        </div>
      )}
    </div>
  )
}
