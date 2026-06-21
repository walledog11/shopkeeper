"use client"

import { useRef, useState } from "react"
import { Loader2, MoreHorizontal, Search, SlidersHorizontal, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BulkActions } from "./BulkActions"
import { TicketListFiltersPanel } from "./TicketListFiltersPanel"
import type { TicketListView, TicketTagFilter } from "./constants"
import type { ChannelType } from "@/types"

interface ThreadListHeaderProps {
  activeView: TicketListView
  channelFilter: ChannelType | null
  connectedChannels: ChannelType[]
  forMeCount: number
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

const DESKTOP_VIEW_OPTIONS: { id: "for_me" | "all_open" | "closed"; label: string }[] = [
  { id: "for_me", label: "Needs you" },
  { id: "all_open", label: "All open" },
  { id: "closed", label: "Closed" },
]

const MOBILE_VIEW_OPTIONS: { id: "for_me" | "all_open" | "closed"; label: string; showCount?: boolean }[] = [
  { id: "for_me", label: "Needs you", showCount: true },
  { id: "all_open", label: "All" },
  { id: "closed", label: "Closed" },
]

const GLASS_SHELL_CLASS =
  "space-y-2 rounded-[22px] border border-foreground/[0.08] bg-card/60 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_50px_rgba(43,33,24,0.13)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-card/45"

const GLASS_CONTROL_CLASS =
  "border border-foreground/[0.08] bg-background/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-background/28"

const GLASS_POPOVER_CLASS =
  "w-60 rounded-2xl border-foreground/[0.08] bg-card/80 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_18px_42px_rgba(43,33,24,0.18)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-card/65"

function mobileViewLabel(
  option: (typeof MOBILE_VIEW_OPTIONS)[number],
  forMeCount: number,
) {
  if (!option.showCount || forMeCount <= 0) return option.label
  return `${option.label} (${forMeCount})`
}

export function ThreadListHeader({
  activeView,
  channelFilter,
  connectedChannels,
  forMeCount,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const showMobileSearch = searchOpen || searchQuery.length > 0
  const hasActiveFilter = channelFilter !== null || tagFilter !== null

  function openMobileSearch() {
    setMobileMenuOpen(false)
    setSearchOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function closeMobileSearch() {
    onSearchChange("")
    setSearchOpen(false)
  }

  const desktopViewSelector = (
    <div
      role="tablist"
      aria-label="Ticket views"
      className={`flex w-full min-w-0 h-9 rounded-full p-0.5 gap-0.5 ${GLASS_CONTROL_CLASS}`}
    >
      {DESKTOP_VIEW_OPTIONS.map(option => {
        const active = activeView === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onViewChange(option.id)}
            className={`flex-1 min-w-0 h-full rounded-full px-2 text-[11px] font-semibold transition-colors ${
              active
                ? "bg-card/80 text-foreground shadow-sm"
                : "text-foreground/40 hover:bg-background/35 hover:text-foreground/60"
            }`}
          >
            <span className="truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )

  const mobileViewSelector = (
    <div
      role="tablist"
      aria-label="Ticket views"
      className={`flex w-full min-w-0 h-9 rounded-full p-0.5 gap-0.5 ${GLASS_CONTROL_CLASS}`}
    >
      {MOBILE_VIEW_OPTIONS.map(option => {
        const active = activeView === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onViewChange(option.id)}
            className={`flex-1 min-w-0 h-full rounded-full px-1.5 text-[11px] font-semibold transition-colors ${
              active
                ? "bg-card/80 text-foreground shadow-sm"
                : "text-foreground/40 hover:bg-background/35 hover:text-foreground/60"
            }`}
          >
            <span className="truncate">{mobileViewLabel(option, forMeCount)}</span>
          </button>
        )
      })}
    </div>
  )

  const filtersPanel = (
    <TicketListFiltersPanel
      channelFilter={channelFilter}
      connectedChannels={connectedChannels}
      spamCount={spamCount}
      tagFilter={tagFilter}
      onChannelFilterChange={onChannelFilterChange}
      onTagFilterChange={onTagFilterChange}
      onViewSpam={() => {
        setMobileMenuOpen(false)
        onViewSpam()
      }}
    />
  )

  const desktopFiltersPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filter tickets"
          className={`relative shrink-0 h-9 px-3 rounded-full flex items-center justify-center gap-1.5 text-xs font-semibold transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] backdrop-blur-md backdrop-saturate-150 ${
            hasActiveFilter
              ? "border border-foreground/15 bg-background/55 text-foreground"
              : "border border-foreground/[0.08] bg-background/30 text-foreground/45 hover:border-foreground/15 hover:bg-background/45 hover:text-foreground/65"
          }`}
        >
          <SlidersHorizontal className="size-3.5" />
          <span className="hidden sm:inline">Filters</span>
          {hasActiveFilter && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-green-400 border border-background" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className={GLASS_POPOVER_CLASS}>
        {filtersPanel}
      </PopoverContent>
    </Popover>
  )

  const mobileOverflowMenu = (
    <Popover open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Search and filter tickets"
          className={`relative size-9 shrink-0 rounded-full flex items-center justify-center transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] backdrop-blur-md backdrop-saturate-150 ${
            hasActiveFilter
              ? "border border-foreground/15 bg-background/55 text-foreground"
              : "border border-foreground/[0.08] bg-background/30 text-foreground/45 hover:border-foreground/15 hover:bg-background/45 hover:text-foreground/65"
          }`}
        >
          <MoreHorizontal className="size-4" />
          {hasActiveFilter && (
            <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-green-400" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className={`${GLASS_POPOVER_CLASS} space-y-3`}>
        <button
          type="button"
          onClick={openMobileSearch}
          className={`w-full h-9 rounded-full text-xs font-semibold text-foreground/60 hover:border-foreground/15 hover:bg-background/45 hover:text-foreground transition-all flex items-center justify-center gap-2 ${GLASS_CONTROL_CLASS}`}
        >
          <Search className="size-3.5" />
          Search tickets
        </button>
        {filtersPanel}
      </PopoverContent>
    </Popover>
  )

  const searchField = (mobile = false) => (
    <div className={`flex items-center gap-2 rounded-full px-3.5 h-9 ${GLASS_CONTROL_CLASS} ${mobile ? "" : "flex-1 min-w-0"}`}>
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
    <div className="relative z-20 shrink-0 px-3 pt-3 pb-3">
      <div className={GLASS_SHELL_CLASS}>
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
              <div className="flex-1 min-w-0">{mobileViewSelector}</div>
              {mobileOverflowMenu}
            </div>
          )}
        </div>

        <div className="hidden md:block space-y-2">
          <div className="flex items-center gap-2">
            {searchField()}
            {desktopFiltersPopover}
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

          {!isSearchMode && activeView !== "spam" && desktopViewSelector}

        </div>

        {hasSelection && (
          <div className="hidden md:block">
            <BulkActions
              selectedCount={selectedCount}
              onBulkArchive={onBulkArchive}
              onBulkClose={onBulkClose}
              onBulkTag={onBulkTag}
              onClearSelection={onClearSelection}
            />
          </div>
        )}
      </div>
    </div>
  )
}
