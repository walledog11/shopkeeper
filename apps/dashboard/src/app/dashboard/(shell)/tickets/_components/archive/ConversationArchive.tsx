"use client"

import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "motion/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TicketQueueCard } from "../queue/TicketQueueCard"
import { TicketQueueLoading } from "../queue/TicketQueueLoading"
import { EmptyState } from "../thread-list/EmptyState"
import type { TicketListView, TicketQueueTierFilter, TicketTagFilter } from "../thread-list/constants"
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
  tierFilter: TicketQueueTierFilter | null
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
  onTierFilterChange: (tier: TicketQueueTierFilter | null) => void
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
  tierFilter,
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
  onTierFilterChange,
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
  const reduceMotion = useReducedMotion()
  // Remount AnimatePresence on any list-identity change (view / filter / search)
  // so a wholesale swap is instant; within a stable list, add/remove animates.
  const listMotionKey = `${activeView}:${isSearchMode ? "search" : "list"}:${channelFilter ?? "all"}:${tagFilter ?? "all"}:${searchQuery}`

  const motionProps = reduceMotion
    ? { initial: false as const, exit: { opacity: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
        transition: { duration: 0.18, ease: "easeOut" as const },
      }

  return (
    <>
      <ArchiveHeader
        activeView={activeView}
        channelFilter={channelFilter}
        connectedChannels={connectedChannels}
        spamCount={spamCount}
        tagFilter={tagFilter}
        tierFilter={tierFilter}
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
        onTierFilterChange={onTierFilterChange}
        onViewChange={onViewChange}
        onViewSpam={onViewSpam}
      />

      <div data-testid="tickets-list" className="w-full">
        {listLoading ? (
          <TicketQueueLoading />
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
              <div className="flex flex-col gap-3">
                <AnimatePresence key={listMotionKey} initial={false}>
                  {tickets.map(ticket => (
                    <m.div
                      key={ticket.id}
                      data-testid="ticket-row"
                      data-ticket-id={ticket.id}
                      data-ticket-channel={ticket.channelType}
                      {...motionProps}
                    >
                      <TicketQueueCard
                        variant="browse"
                        ticket={ticket}
                        activeView={activeView}
                        hasShopify={hasShopify}
                        orgSettings={orgSettings}
                        isActive={activeTicketId === ticket.id}
                        isApproving={approvingTicketId === ticket.id}
                        actionsDisabled={approvingTicketId !== null && approvingTicketId !== ticket.id}
                        selection={{
                          hasSelection,
                          isSelected: selectedIds.includes(ticket.id),
                          onToggleSelect: () => onToggleSelect(ticket.id),
                        }}
                        onOpen={() => onSelectTicket(ticket.id)}
                        onSend={() => onQuickApproveFromList(ticket.id)}
                        onReview={() => onReviewFromList(ticket.id)}
                        onMarkAsSpam={onMarkAsSpam ? () => onMarkAsSpam(ticket.id) : undefined}
                        onRecover={onRecover ? () => onRecover(ticket.id) : undefined}
                      />
                    </m.div>
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
    </>
  )
}
