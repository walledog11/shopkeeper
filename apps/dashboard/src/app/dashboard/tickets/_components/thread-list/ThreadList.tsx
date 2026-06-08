"use client"

import { EmptyState } from "./EmptyState"
import { ThreadListHeader } from "./ThreadListHeader"
import { TicketRow } from "./TicketRow"
import type { TicketListTab } from "./constants"
import type { ChannelType, Ticket } from "@/types"

interface Props {
  tickets: Ticket[]
  totalCount: number
  activeTab: TicketListTab
  activeFilter: ChannelType | null
  activeTicketId: string | null
  openCount: number
  closedCount: number
  spamCount: number
  searchQuery: string
  listState?: {
    searchMode?: boolean
    searchLoading?: boolean
    hasMore?: boolean
    loadingMore?: boolean
  }
  selectedIds: string[]
  needsReply: boolean
  onNeedsReplyChange: (value: boolean) => void
  onSearchChange: (q: string) => void
  onTabChange: (tab: TicketListTab) => void
  onFilterChange: (id: ChannelType | null) => void
  onSelectTicket: (id: string) => void
  onToggleSelect: (id: string) => void
  onBulkClose: () => void
  onBulkArchive: () => void
  onBulkTag: (tag: string) => void
  onClearSelection: () => void
  onLoadMore?: () => void
  onMarkAsSpam?: (id: string) => void
  onRecover?: (id: string) => void
}

export default function ThreadList({
  tickets,
  totalCount,
  activeTab,
  activeFilter,
  activeTicketId,
  openCount,
  closedCount,
  spamCount,
  searchQuery,
  listState,
  selectedIds,
  needsReply,
  onNeedsReplyChange,
  onSearchChange,
  onTabChange,
  onFilterChange,
  onSelectTicket,
  onToggleSelect,
  onBulkClose,
  onBulkArchive,
  onBulkTag,
  onClearSelection,
  onLoadMore,
  onMarkAsSpam,
  onRecover,
}: Props) {
  const hasSelection = selectedIds.length > 0
  const {
    searchMode: isSearchMode,
    searchLoading: isSearchLoading,
    hasMore,
    loadingMore: isLoadingMore,
  } = listState ?? {}

  return (
    <>
      <ThreadListHeader
        activeFilter={activeFilter}
        activeTab={activeTab}
        hasSelection={hasSelection}
        isSearchLoading={isSearchLoading}
        isSearchMode={isSearchMode}
        openCount={openCount}
        closedCount={closedCount}
        spamCount={spamCount}
        searchQuery={searchQuery}
        selectedCount={selectedIds.length}
        needsReply={needsReply}
        onNeedsReplyChange={onNeedsReplyChange}
        onBulkArchive={onBulkArchive}
        onBulkClose={onBulkClose}
        onBulkTag={onBulkTag}
        onClearSelection={onClearSelection}
        onFilterChange={onFilterChange}
        onSearchChange={onSearchChange}
        onTabChange={onTabChange}
      />

      <div
        data-testid="tickets-list"
        className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/[0.1]"
      >
        {tickets.map(ticket => (
          <TicketRow
            key={ticket.id}
            activeTab={activeTab}
            activeTicketId={activeTicketId}
            hasSelection={hasSelection}
            isSearchMode={isSearchMode}
            isSelected={selectedIds.includes(ticket.id)}
            ticket={ticket}
            onSelectTicket={onSelectTicket}
            onToggleSelect={onToggleSelect}
            onMarkAsSpam={onMarkAsSpam}
            onRecover={onRecover}
          />
        ))}

        {tickets.length === 0 && (
          <EmptyState
            activeFilter={activeFilter}
            activeTab={activeTab}
            isSearchMode={isSearchMode}
            searchQuery={searchQuery}
            totalCount={totalCount}
          />
        )}

        {!isSearchMode && hasMore && tickets.length > 0 && (
          <div className="px-4 py-3 border-t border-white/[0.05]">
            <button type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="w-full text-xs font-semibold text-white/40 hover:text-white/70 disabled:opacity-40 transition-colors py-1"
            >
              {isLoadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
