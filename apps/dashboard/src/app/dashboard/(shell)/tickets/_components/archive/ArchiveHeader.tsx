"use client"

import { ChevronLeft, Loader2, Search, SlidersHorizontal, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BulkActions } from "../thread-list/BulkActions"
import { TicketListFiltersPanel } from "../thread-list/TicketListFiltersPanel"
import type { TicketListView, TicketTagFilter } from "../thread-list/constants"
import type { ChannelType } from "@/types"

interface ArchiveHeaderProps {
  activeView: TicketListView
  channelFilter: ChannelType | null
  connectedChannels: ChannelType[]
  spamCount: number
  tagFilter: TicketTagFilter | null
  hasSelection: boolean
  selectedCount: number
  isSearchLoading?: boolean
  isSearchMode?: boolean
  searchQuery: string
  onBulkArchive: () => void
  onBulkClose: () => void
  onBulkTag: (tag: string) => void
  onChannelFilterChange: (id: ChannelType | null) => void
  onClearSelection: () => void
  onSearchChange: (q: string) => void
  onTagFilterChange: (tag: TicketTagFilter | null) => void
  onViewChange: (view: TicketListView) => void
  onViewSpam: () => void
}

const SCOPES: { id: "all_open" | "closed"; label: string }[] = [
  { id: "all_open", label: "All open" },
  { id: "closed", label: "Closed" },
]

export function ArchiveHeader({
  activeView,
  channelFilter,
  connectedChannels,
  spamCount,
  tagFilter,
  hasSelection,
  selectedCount,
  isSearchLoading,
  isSearchMode,
  searchQuery,
  onBulkArchive,
  onBulkClose,
  onBulkTag,
  onChannelFilterChange,
  onClearSelection,
  onSearchChange,
  onTagFilterChange,
  onViewChange,
  onViewSpam,
}: ArchiveHeaderProps) {
  const hasActiveFilter = channelFilter !== null || tagFilter !== null
  const isSpam = activeView === "spam"

  const scopeControl = isSpam ? (
    <div className="inline-flex items-center gap-2">
      <span className="inline-flex items-center rounded-full bg-foreground/[0.06] px-2.5 py-1 text-xs font-semibold text-muted-foreground">
        Spam
      </span>
      <button
        type="button"
        onClick={() => onViewChange("all_open")}
        className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Back to open
      </button>
    </div>
  ) : (
    <div className="inline-flex items-center rounded-full border border-border bg-card p-0.5">
      {SCOPES.map(scope => {
        const active = activeView === scope.id
        return (
          <button
            key={scope.id}
            type="button"
            onClick={() => onViewChange(scope.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              active ? "bg-foreground/[0.06] text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {scope.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <header data-testid="archive-header" className="shrink-0 px-5 pt-4 md:px-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              // Returning to the queue must also drop any active search, or the
              // search results keep showing over the "for_me" view.
              if (searchQuery) onSearchChange("")
              onViewChange("for_me")
            }}
            className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Inbox
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Filter conversations"
                className={`relative ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
                  hasActiveFilter
                    ? "border-foreground/20 bg-foreground/[0.06] text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <SlidersHorizontal className="size-3.5" />
                Filters
                {hasActiveFilter && (
                  <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 rounded-2xl border-border bg-card p-3">
              <TicketListFiltersPanel
                channelFilter={channelFilter}
                connectedChannels={connectedChannels}
                spamCount={spamCount}
                tagFilter={tagFilter}
                onChannelFilterChange={onChannelFilterChange}
                onTagFilterChange={onTagFilterChange}
                onViewSpam={onViewSpam}
              />
            </PopoverContent>
          </Popover>
        </div>

        {!isSearchMode && <div className="flex items-center">{scopeControl}</div>}

        <div className="flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            aria-label="Search conversations"
            value={searchQuery}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Search all conversations…"
            className="min-w-0 flex-1 bg-transparent text-sm text-strong outline-none placeholder:text-faint"
          />
          {isSearchLoading && <Loader2 className="size-4 shrink-0 animate-spin text-faint" />}
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="shrink-0 text-faint transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {hasSelection && (
          <BulkActions
            selectedCount={selectedCount}
            onBulkArchive={onBulkArchive}
            onBulkClose={onBulkClose}
            onBulkTag={onBulkTag}
            onClearSelection={onClearSelection}
          />
        )}
      </div>
    </header>
  )
}
