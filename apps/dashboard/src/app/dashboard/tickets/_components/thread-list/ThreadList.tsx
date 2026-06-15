"use client"

import { EmptyState } from "./EmptyState"
import { ThreadListHeader } from "./ThreadListHeader"
import { ThreadListLoading } from "./ThreadListLoading"
import { TicketRow } from "./TicketRow"
import type { TicketListView, TicketTagFilter } from "./constants"
import type { ChannelType, OrgSettings, Ticket } from "@/types"

interface Props {
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
  onQuickApproveFromList: (threadId: string) => void
  onReviewFromList: (threadId: string) => void
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
}

export default function ThreadList({
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
  onQuickApproveFromList,
  onReviewFromList,
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
}: Props) {
  const hasSelection = selectedIds.length > 0
  const {
    searchMode: isSearchMode,
    searchLoading: isSearchLoading,
    listLoading,
    hasMore,
    loadingMore: isLoadingMore,
  } = listState ?? {}

  return (
    <>
      <ThreadListHeader
        activeView={activeView}
        channelFilter={channelFilter}
        connectedChannels={connectedChannels}
        spamCount={spamCount}
        tagFilter={tagFilter}
        hasSelection={hasSelection}
        isSearchLoading={isSearchLoading}
        isSearchMode={isSearchMode}
        searchQuery={searchQuery}
        selectedCount={selectedIds.length}
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

      <div
        data-testid="tickets-list"
        className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/[0.1]"
      >
        {listLoading ? (
          <ThreadListLoading />
        ) : (
          <>
            {tickets.map(ticket => (
              <TicketRow
                key={ticket.id}
                activeView={activeView}
                activeTicketId={activeTicketId}
                hasSelection={hasSelection}
                hasShopify={hasShopify}
                isSearchMode={isSearchMode}
                isSelected={selectedIds.includes(ticket.id)}
                orgSettings={orgSettings}
                approvingTicketId={approvingTicketId}
                onQuickApproveFromList={onQuickApproveFromList}
                onReviewFromList={onReviewFromList}
                ticket={ticket}
                onSelectTicket={onSelectTicket}
                onToggleSelect={onToggleSelect}
                onMarkAsSpam={onMarkAsSpam}
                onRecover={onRecover}
              />
            ))}

            {tickets.length === 0 && (
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
          </>
        )}
      </div>
    </>
  )
}
