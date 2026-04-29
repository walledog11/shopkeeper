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
  searchQuery: string
  selectedCount: number
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
  searchQuery,
  selectedCount,
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
        <Search className="w-3.5 h-3.5 text-white/20 shrink-0" />
        <input
          value={searchQuery}
          onChange={event => onSearchChange(event.target.value)}
          placeholder="Search all tickets…"
          className="flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/25 outline-none"
        />
        {searchQuery && (
          <button onClick={() => onSearchChange("")} className="text-white/20 hover:text-white/50 transition-colors">
            <X className="w-3.5 h-3.5" />
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
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === "open" ? "bg-amber-400" : "bg-white/20"}`} />
              Open
              {openCount > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
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
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === "closed" ? "bg-green-400" : "bg-white/20"}`} />
              Closed
            </TabsTrigger>
            <TabsTrigger
              value="filtered"
              className="flex-1 gap-1.5 py-1.5 h-auto text-xs font-semibold data-[state=active]:bg-white/[0.12] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-white/35"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === "filtered" ? "bg-red-400" : "bg-white/20"}`} />
              Filtered
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {isSearchMode && (
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1.5">
            {isSearchLoading && <Loader2 className="w-3 h-3 text-white/30 animate-spin" />}
            <span className="text-[11px] font-semibold text-white/40">
              {isSearchLoading ? "Searching…" : "Search results"}
            </span>
          </div>
          <button onClick={() => onSearchChange("")} className="text-[11px] text-white/30 hover:text-white/60 font-medium">
            Clear
          </button>
        </div>
      )}

      {!isSearchMode && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onFilterChange(null)}
            className={`flex-1 h-9 rounded-md border text-[11px] font-semibold transition-all ${
              activeFilter === null
                ? "bg-white/[0.15] text-white border-white/[0.35]"
                : "bg-transparent border-border text-white/40 hover:border-white/[0.18] hover:text-white/60"
            }`}
          >
            All
          </button>
          {CHANNEL_FILTERS.map(channel => (
            <button
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
