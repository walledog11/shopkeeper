"use client"

import { useMemo } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useIsMobile } from "@/hooks/useMobile"
import { groupTicketsByTriageTier } from "../../_lib/group-tickets-by-triage-tier"
import { EmptyState } from "./EmptyState"
import { ThreadListHeader } from "./ThreadListHeader"
import { ThreadListLoading } from "./ThreadListLoading"
import { ThreadListTierSection } from "./ThreadListTierSection"
import { TicketRow } from "./TicketRow"
import type { TicketListView, TicketTagFilter } from "./constants"
import type { ChannelType, OrgSettings, Ticket } from "@/types"

interface Props {
  tickets: Ticket[]
  totalCount: number
  forMeCount: number
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

interface TicketRowRenderProps {
  activeView: TicketListView
  activeTicketId: string | null
  approvingTicketId: string | null
  hasSelection: boolean
  hasShopify: boolean
  isSearchMode?: boolean
  orgSettings?: Partial<OrgSettings> | null
  selectedIds: string[]
  onQuickApproveFromList: (threadId: string) => void
  onReviewFromList: (threadId: string) => void
  onSelectTicket: (id: string) => void
  onToggleSelect: (id: string) => void
  onMarkAsSpam?: (id: string) => void
  onRecover?: (id: string) => void
}

function renderTicketRow(ticket: Ticket, props: TicketRowRenderProps) {
  const {
    activeView,
    activeTicketId,
    approvingTicketId,
    hasSelection,
    hasShopify,
    isSearchMode,
    orgSettings,
    selectedIds,
    onQuickApproveFromList,
    onReviewFromList,
    onSelectTicket,
    onToggleSelect,
    onMarkAsSpam,
    onRecover,
  } = props

  return (
    <TicketRow
      key={ticket.id}
      activeView={activeView}
      activeTicketId={activeTicketId}
      approvingTicketId={approvingTicketId}
      hasSelection={hasSelection}
      hasShopify={hasShopify}
      isSearchMode={isSearchMode}
      isSelected={selectedIds.includes(ticket.id)}
      orgSettings={orgSettings}
      onQuickApproveFromList={onQuickApproveFromList}
      onReviewFromList={onReviewFromList}
      ticket={ticket}
      onSelectTicket={onSelectTicket}
      onToggleSelect={onToggleSelect}
      onMarkAsSpam={onMarkAsSpam}
      onRecover={onRecover}
    />
  )
}

export default function ThreadList({
  tickets,
  totalCount,
  forMeCount,
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
  const isMobile = useIsMobile()
  const hasSelection = selectedIds.length > 0
  const {
    searchMode: isSearchMode,
    searchLoading: isSearchLoading,
    listLoading,
    hasMore,
    loadingMore: isLoadingMore,
  } = listState ?? {}

  const useTieredForMeLayout = isMobile && activeView === "for_me" && !isSearchMode

  const tierGroups = useMemo(
    () => useTieredForMeLayout
      ? groupTicketsByTriageTier(tickets, { orgSettings, hasShopify, isMobile })
      : [],
    [hasShopify, isMobile, orgSettings, tickets, useTieredForMeLayout],
  )

  const ticketRowProps: TicketRowRenderProps = {
    activeView,
    activeTicketId,
    approvingTicketId,
    hasSelection,
    hasShopify,
    isSearchMode,
    orgSettings,
    selectedIds,
    onQuickApproveFromList,
    onReviewFromList,
    onSelectTicket,
    onToggleSelect,
    onMarkAsSpam,
    onRecover,
  }

  return (
    <>
      <ThreadListHeader
        activeView={activeView}
        channelFilter={channelFilter}
        connectedChannels={connectedChannels}
        forMeCount={forMeCount}
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
        className={`flex-1 overflow-y-auto custom-scrollbar ${
          useTieredForMeLayout ? "" : "divide-y divide-foreground/[0.1]"
        }`}
      >
        {listLoading ? (
          <ThreadListLoading />
        ) : (
          <>
            <TooltipProvider delayDuration={300}>
              {useTieredForMeLayout ? (
                <>
                  {tierGroups.map(group => (
                    <ThreadListTierSection
                      key={group.tier}
                      tier={group.tier}
                      label={group.label}
                      count={group.tickets.length}
                      collapsible={group.collapsible}
                      defaultExpanded={group.defaultExpanded}
                    >
                      {group.tickets.map(ticket => renderTicketRow(ticket, ticketRowProps))}
                    </ThreadListTierSection>
                  ))}
                </>
              ) : (
                tickets.map(ticket => renderTicketRow(ticket, ticketRowProps))
              )}
            </TooltipProvider>

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
              <div className="px-4 py-3 border-t border-foreground/[0.05]">
                <button type="button"
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className="w-full text-xs font-semibold text-foreground/40 hover:text-foreground/70 disabled:opacity-40 transition-colors py-1"
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
