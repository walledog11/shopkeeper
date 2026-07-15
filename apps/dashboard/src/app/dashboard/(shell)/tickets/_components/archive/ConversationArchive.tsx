"use client"

import { AnimatePresence, LazyMotion, domAnimation } from "motion/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { EmptyState } from "../thread-list/EmptyState"
import { ThreadListLoading } from "../thread-list/ThreadListLoading"
import { TicketRow } from "../thread-list/TicketRow"
import type { TicketListView, TicketTagFilter } from "../thread-list/constants"
import { ArchiveHeader } from "./ArchiveHeader"
import type { ChannelType, OrgSettings, Ticket } from "@/types"

interface ConversationArchiveProps {
  tickets: Ticket[]
  totalCount: number
  activeView: TicketListView
  channelFilter: ChannelType | null
  connectedChannels: ChannelType[]
  spamCount: number
  tagFilter: TicketTagFilter | null
  activeTicketId: string | null
  searchQuery: string
  hasShopify: boolean
  orgSettings?: Partial<OrgSettings> | null
  approvingTicketId: string | null
  listState?: {
    searchMode?: boolean
    searchLoading?: boolean
    listLoading?: boolean
    hasMore?: boolean
    loadingMore?: boolean
  }
  selectedIds: string[]
  onChannelFilterChange: (id: ChannelType | null) => void
  onTagFilterChange: (tag: TicketTagFilter | null) => void
  onSearchChange: (q: string) => void
  onViewChange: (view: TicketListView) => void
  onViewSpam: () => void
  onSelectTicket: (id: string) => void
  onToggleSelect: (id: string) => void
  onBulkClose: () => void
  onBulkArchive: () => void
  onBulkTag: (tag: string) => void
  onClearSelection: () => void
  onLoadMore?: () => void
  onMarkAsSpam?: (id: string) => void
  onRecover?: (id: string) => void
  onQuickApproveFromList: (id: string) => void
  onReviewFromList: (id: string) => void
}

export function ConversationArchive({
  tickets,
  totalCount,
  activeView,
  channelFilter,
  connectedChannels,
  spamCount,
  tagFilter,
  activeTicketId,
  searchQuery,
  hasShopify,
  orgSettings = null,
  approvingTicketId,
  listState,
  selectedIds,
  onChannelFilterChange,
  onTagFilterChange,
  onSearchChange,
  onViewChange,
  onViewSpam,
  onSelectTicket,
  onToggleSelect,
  onBulkClose,
  onBulkArchive,
  onBulkTag,
  onClearSelection,
  onLoadMore,
  onMarkAsSpam,
  onRecover,
  onQuickApproveFromList,
  onReviewFromList,
}: ConversationArchiveProps) {
  const {
    searchMode: isSearchMode,
    searchLoading: isSearchLoading,
    listLoading,
    hasMore,
    loadingMore: isLoadingMore,
  } = listState ?? {}

  const hasSelection = selectedIds.length > 0
  // Remount AnimatePresence on any list-identity change (view / filter / search)
  // so a wholesale swap is instant; within a stable list, add/remove animates.
  const listMotionKey = `${activeView}:${isSearchMode ? "search" : "list"}:${channelFilter ?? "all"}:${tagFilter ?? "all"}:${searchQuery}`

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ArchiveHeader
        activeView={activeView}
        channelFilter={channelFilter}
        connectedChannels={connectedChannels}
        spamCount={spamCount}
        tagFilter={tagFilter}
        hasSelection={hasSelection}
        selectedCount={selectedIds.length}
        isSearchLoading={isSearchLoading}
        isSearchMode={isSearchMode}
        searchQuery={searchQuery}
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

      <div data-testid="tickets-list" className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-5 py-5 md:px-6">
          {listLoading ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <ThreadListLoading />
            </div>
          ) : tickets.length === 0 ? (
            <EmptyState
              activeView={activeView}
              channelFilter={channelFilter}
              connectedChannels={connectedChannels}
              isSearchMode={isSearchMode}
              searchQuery={searchQuery}
              tagFilter={tagFilter}
              totalCount={totalCount}
              onViewChange={onViewChange}
            />
          ) : (
            <LazyMotion features={domAnimation}>
              <TooltipProvider delayDuration={300}>
                <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-foreground/[0.06]">
                  <AnimatePresence key={listMotionKey} initial={false}>
                    {tickets.map(ticket => (
                      <TicketRow
                        key={ticket.id}
                        animate
                        activeView={activeView}
                        activeTicketId={activeTicketId}
                        approvingTicketId={approvingTicketId}
                        context={{ hasShopify, isSearchMode }}
                        selection={{ hasSelection, isSelected: selectedIds.includes(ticket.id) }}
                        orgSettings={orgSettings}
                        ticket={ticket}
                        onQuickApproveFromList={onQuickApproveFromList}
                        onReviewFromList={onReviewFromList}
                        onSelectTicket={onSelectTicket}
                        onToggleSelect={onToggleSelect}
                        onMarkAsSpam={onMarkAsSpam}
                        onRecover={onRecover}
                      />
                    ))}
                  </AnimatePresence>
                </div>

                {!isSearchMode && hasMore && (
                  <div className="pt-3">
                    <button
                      type="button"
                      onClick={onLoadMore}
                      disabled={isLoadingMore}
                      className="w-full rounded-full border border-border py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    >
                      {isLoadingMore ? "Loading…" : "Load more"}
                    </button>
                  </div>
                )}
              </TooltipProvider>
            </LazyMotion>
          )}
        </div>
      </div>
    </div>
  )
}
