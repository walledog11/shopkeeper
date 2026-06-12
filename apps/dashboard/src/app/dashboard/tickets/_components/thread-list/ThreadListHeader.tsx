"use client"

import Image from "next/image"
import { Loader2, Search, X } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BulkActions } from "./BulkActions"
import { CHANNEL_FILTERS, type TicketListTab } from "./constants"
import type { ChannelType } from "@/types"

interface ThreadListHeaderProps {
  activeFilter: ChannelType | null
  activeTab: TicketListTab
  hasSelection: boolean
  isSearchLoading?: boolean
  isSearchMode?: boolean
  openCount: number
  closedCount: number
  spamCount: number
  searchQuery: string
  selectedCount: number
  needsReply: boolean
  onNeedsReplyChange: (value: boolean) => void
  onBulkArchive: () => void
  onBulkClose: () => void
  onBulkTag: (tag: string) => void
  onClearSelection: () => void
  onFilterChange: (id: ChannelType | null) => void
  onSearchChange: (q: string) => void
  onTabChange: (tab: TicketListTab) => void
}

export function ThreadListHeader({
  activeFilter,
  activeTab,
  hasSelection,
  isSearchLoading,
  isSearchMode,
  openCount,
  closedCount,
  spamCount,
  searchQuery,
  selectedCount,
  needsReply,
  onNeedsReplyChange,
  onBulkArchive,
  onBulkClose,
  onBulkTag,
  onClearSelection,
  onFilterChange,
  onSearchChange,
  onTabChange,
}: ThreadListHeaderProps) {
  return (
    <div className="px-3 pt-5 md:pt-3 pb-3 border-b border-border bg-background space-y-2">
      <div className="flex items-center gap-2 bg-white/[0.05] border border-border rounded-md px-3 h-9">
        <Search className="size-3.5 text-white/20 shrink-0" />
        <input
          aria-label="Search tickets"
          value={searchQuery}
          onChange={event => onSearchChange(event.target.value)}
          placeholder="Search all tickets…"
          className="flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/25 outline-none"
        />
        {searchQuery && (
          <button type="button" onClick={() => onSearchChange("")} className="text-white/20 hover:text-white/50 transition-colors">
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {!isSearchMode && (
        <Tabs value={activeTab} onValueChange={value => onTabChange(value as TicketListTab)}>
          <TabsList className="w-full bg-white/[0.06] h-auto p-0.5 gap-0.5">
            <TabsTrigger
              value="open"
              className="flex-1 gap-1.5 py-1.5 h-auto text-xs font-semibold data-[state=active]:bg-white/[0.12] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-white/35"
            >
              Open
              {openCount > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === "open" ? "bg-white/[0.15] text-white" : "bg-white/[0.08] text-white/35"
                }`}>
                  {openCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="closed"
              className="flex-1 gap-1.5 py-1.5 h-auto text-xs font-semibold data-[state=active]:bg-white/[0.12] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-white/35"
            >
              Closed
              {closedCount > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === "closed" ? "bg-white/[0.15] text-white" : "bg-white/[0.08] text-white/35"
                }`}>
                  {closedCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="filtered"
              title="Spam — automatically filtered messages"
              className="flex-1 gap-1.5 py-1.5 h-auto text-xs font-semibold data-[state=active]:bg-white/[0.12] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-white/35"
            >
              Spam
              {spamCount > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === "filtered" ? "bg-white/[0.15] text-white" : "bg-white/[0.08] text-white/35"
                }`}>
                  {spamCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {isSearchMode && (
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1.5">
            {isSearchLoading && <Loader2 className="size-3 text-white/30 animate-spin" />}
            <span className="text-xs font-semibold text-white/40">
              {isSearchLoading ? "Searching…" : "Search results"}
            </span>
          </div>
          <button type="button" onClick={() => onSearchChange("")} className="text-xs text-white/30 hover:text-white/60 font-medium">
            Clear
          </button>
        </div>
      )}

      {!isSearchMode && activeTab === "open" && (
        <button
          type="button"
          onClick={() => onNeedsReplyChange(!needsReply)}
          title="Show only tickets where the customer sent the last message"
          className={`w-full h-8 rounded-md border text-xs font-semibold transition-all ${
            needsReply
              ? "bg-white/[0.15] text-white border-white/[0.35]"
              : "bg-transparent border-border text-white/40 hover:border-white/[0.18] hover:text-white/60"
          }`}
        >
          Needs my reply
        </button>
      )}

      {!isSearchMode && (
        <div className="flex items-center gap-1.5">
          <button type="button"
            onClick={() => onFilterChange(null)}
            className={`flex-1 h-9 rounded-md border text-xs font-semibold transition-all ${
              activeFilter === null
                ? "bg-white/[0.15] text-white border-white/[0.35]"
                : "bg-transparent border-border text-white/40 hover:border-white/[0.18] hover:text-white/60"
            }`}
          >
            All
          </button>
          {CHANNEL_FILTERS.map(channel => (
            <button type="button"
              key={channel.id}
              onClick={() => onFilterChange(activeFilter === channel.id ? null : channel.id)}
              title={channel.label}
              className={`flex-1 h-9 rounded-md border flex items-center justify-center transition-all ${
                activeFilter === channel.id
                  ? "border-white/[0.30] bg-white/[0.10]"
                  : "border-border bg-transparent hover:border-white/[0.18] hover:bg-white/[0.05]"
              }`}
            >
              <Image src={channel.logo} alt={channel.label} width={16} height={16} className="object-contain opacity-60 brightness-0 invert" />
            </button>
          ))}
        </div>
      )}

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
