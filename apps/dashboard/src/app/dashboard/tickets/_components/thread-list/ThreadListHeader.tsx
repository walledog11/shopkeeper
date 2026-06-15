"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BulkActions } from "./BulkActions"
import {
  buildChannelFilters,
  getTagStyle,
  TICKET_TAG_FILTERS,
  type TicketListView,
  type TicketTagFilter,
} from "./constants"
import type { ChannelType } from "@/types"

interface ThreadListHeaderProps {
  activeView: TicketListView
  channelFilter: ChannelType | null
  connectedChannels: ChannelType[]
  spamCount: number
  tagFilter: TicketTagFilter | null
  hasSelection: boolean
  isSearchLoading?: boolean
  isSearchMode?: boolean
  searchQuery: string
  selectedCount: number
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

const VIEW_OPTIONS: { id: "for_me" | "all_open" | "closed"; label: string }[] = [
  { id: "for_me", label: "For me" },
  { id: "all_open", label: "All open" },
  { id: "closed", label: "Closed" },
]

export function ThreadListHeader({
  activeView,
  channelFilter,
  connectedChannels,
  spamCount,
  tagFilter,
  hasSelection,
  isSearchLoading,
  isSearchMode,
  searchQuery,
  selectedCount,
  onBulkArchive,
  onBulkClose,
  onBulkTag,
  onChannelFilterChange,
  onClearSelection,
  onSearchChange,
  onTagFilterChange,
  onViewChange,
  onViewSpam,
}: ThreadListHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const showMobileSearch = searchOpen || searchQuery.length > 0
  const channelFilters = buildChannelFilters(connectedChannels)
  const hasActiveFilter = channelFilter !== null || tagFilter !== null

  function openMobileSearch() {
    setSearchOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function closeMobileSearch() {
    onSearchChange("")
    setSearchOpen(false)
  }

  const viewSelector = (
    <div
      role="tablist"
      aria-label="Ticket views"
      className="flex w-full min-w-0 h-9 rounded-md bg-foreground/[0.05] border border-border p-0.5 gap-0.5"
    >
      {VIEW_OPTIONS.map(option => {
        const active = activeView === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onViewChange(option.id)}
            className={`flex-1 min-w-0 h-full rounded-[5px] px-2 text-[11px] font-semibold transition-colors ${
              active
                ? "bg-foreground/[0.08] text-foreground shadow-sm"
                : "text-foreground/40 hover:text-foreground/60"
            }`}
          >
            <span className="truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )

  const filtersPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filter tickets"
          className={`relative shrink-0 h-9 px-2.5 rounded-md border flex items-center justify-center gap-1.5 text-xs font-semibold transition-all ${
            hasActiveFilter
              ? "bg-foreground/[0.06] text-foreground border-foreground/20"
              : "border-border text-foreground/40 hover:border-foreground/20 hover:text-foreground/60"
          }`}
        >
          <SlidersHorizontal className="size-3.5" />
          <span className="hidden sm:inline">Filters</span>
          {hasActiveFilter && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-green-400 border border-background" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-2 space-y-3">
        {channelFilters.length > 0 && (
          <div className="space-y-1.5">
            <div className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/30">Channel</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onChannelFilterChange(null)}
                className={`h-7 px-2.5 rounded-md border text-xs font-semibold transition-all ${
                  channelFilter === null
                    ? "bg-foreground/[0.08] text-foreground border-foreground/20"
                    : "bg-transparent border-border text-foreground/40 hover:border-foreground/20 hover:text-foreground/60"
                }`}
              >
                All
              </button>
              {channelFilters.map(channel => (
                <button
                  type="button"
                  key={channel.id}
                  onClick={() => onChannelFilterChange(channelFilter === channel.id ? null : channel.id)}
                  className={`h-7 px-2.5 rounded-md border text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    channelFilter === channel.id
                      ? "bg-foreground/[0.08] text-foreground border-foreground/20"
                      : "bg-transparent border-border text-foreground/40 hover:border-foreground/20 hover:text-foreground/60"
                  }`}
                >
                  <Image src={channel.logo} alt={channel.label} width={12} height={12} className="object-contain opacity-70" />
                  {channel.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/30">Issue type</div>
          <div className="flex flex-wrap gap-1.5">
            {TICKET_TAG_FILTERS.map(tag => {
              const style = getTagStyle(tag)
              const active = tagFilter === tag
              return (
                <button
                  type="button"
                  key={tag}
                  onClick={() => onTagFilterChange(active ? null : tag)}
                  className={`h-7 px-2.5 rounded-full text-xs font-semibold transition-all border ${
                    active
                      ? `${style.className} border-foreground/15`
                      : "bg-transparent border-border text-foreground/40 hover:border-foreground/20 hover:text-foreground/60"
                  }`}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </div>

        {spamCount > 0 && (
          <button
            type="button"
            onClick={onViewSpam}
            className="w-full h-8 rounded-md border border-border text-xs font-semibold text-foreground/40 hover:border-foreground/20 hover:text-foreground/60 transition-all"
          >
            View spam ({spamCount})
          </button>
        )}
      </PopoverContent>
    </Popover>
  )

  const searchField = (mobile = false) => (
    <div className={`flex items-center gap-2 bg-foreground/[0.04] border border-border rounded-md px-3 h-9 ${mobile ? "" : "flex-1 min-w-0"}`}>
      <Search className="size-3.5 text-foreground/25 shrink-0" />
      <input
        ref={mobile ? inputRef : undefined}
        aria-label="Search tickets"
        value={searchQuery}
        onChange={event => onSearchChange(event.target.value)}
        placeholder="Search all tickets…"
        className="flex-1 bg-transparent text-sm text-foreground/70 placeholder:text-foreground/30 outline-none min-w-0"
      />
      {isSearchLoading && <Loader2 className="size-3.5 text-foreground/30 animate-spin shrink-0" />}
      {searchQuery && (
        <button
          type="button"
          onClick={() => onSearchChange("")}
          aria-label="Clear search"
          className="text-foreground/25 hover:text-foreground/50 transition-colors"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )

  return (
    <div className="px-3 pt-5 md:pt-3 pb-3 border-b border-border bg-background space-y-2">
      <div className="md:hidden space-y-2">
        {showMobileSearch ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">{searchField(true)}</div>
            <button
              type="button"
              onClick={closeMobileSearch}
              className="shrink-0 text-xs text-foreground/40 hover:text-foreground/60 font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : activeView === "spam" ? (
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-semibold text-foreground/40">Spam messages</span>
            <button
              type="button"
              onClick={() => onViewChange("for_me")}
              className="text-xs text-foreground/30 hover:text-foreground/60 font-medium"
            >
              Back
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-1 min-w-0">{viewSelector}</div>
            <button
              type="button"
              onClick={openMobileSearch}
              aria-label="Search tickets"
              className="size-9 shrink-0 rounded-md border border-border text-foreground/40 flex items-center justify-center transition-all hover:border-foreground/20 hover:text-foreground/60"
            >
              <Search className="size-4" />
            </button>
            {filtersPopover}
          </div>
        )}
      </div>

      <div className="hidden md:block space-y-2">
        <div className="flex items-center gap-2">
          {searchField()}
          {filtersPopover}
        </div>

        {!isSearchMode && activeView === "spam" && (
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-semibold text-foreground/40">Spam messages</span>
            <button
              type="button"
              onClick={() => onViewChange("for_me")}
              className="text-xs text-foreground/30 hover:text-foreground/60 font-medium"
            >
              Back to inbox
            </button>
          </div>
        )}

        {!isSearchMode && activeView !== "spam" && viewSelector}

        {isSearchMode && (
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-1.5">
              {isSearchLoading && <Loader2 className="size-3 text-foreground/30 animate-spin" />}
              <span className="text-xs font-semibold text-foreground/40">
                {isSearchLoading ? "Searching…" : "Search results"}
              </span>
            </div>
            <button type="button" onClick={() => onSearchChange("")} className="text-xs text-foreground/30 hover:text-foreground/60 font-medium">
              Clear
            </button>
          </div>
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
  )
}
