import Link from "next/link"
import { Inbox } from "lucide-react"
import { CHANNEL_FILTERS, type TicketListTab } from "./constants"
import type { ChannelType } from "@/types"

interface EmptyStateProps {
  activeFilter: ChannelType | null
  activeTab: TicketListTab
  isSearchMode?: boolean
  searchQuery: string
  totalCount: number
}

export function EmptyState({
  activeFilter,
  activeTab,
  isSearchMode,
  searchQuery,
  totalCount,
}: EmptyStateProps) {
  if (isSearchMode) {
    return (
      <div className="text-center p-8 text-white/30 text-sm">
        No results for &ldquo;{searchQuery}&rdquo;
      </div>
    )
  }

  if (totalCount === 0 && !searchQuery && !activeFilter) {
    return (
      <div className="flex flex-col items-center text-center p-8 gap-3">
        <div className="size-12 rounded-md bg-white/[0.05] border border-border flex items-center justify-center">
          <Inbox className="size-5 text-white/20" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/50 mb-1">No tickets yet</p>
          <p className="text-xs text-white/30 mb-3">Connect a channel to start receiving customer messages.</p>
          <Link href="/dashboard/integrations" className="text-xs font-semibold text-white/50 hover:text-white/80 transition-colors">
            Set up integrations →
          </Link>
        </div>
      </div>
    )
  }

  const tabLabel = activeTab === "filtered" ? "spam" : activeTab

  return (
    <div className="text-center p-8 text-white/25 text-sm">
      {searchQuery
        ? `No results for "${searchQuery}"`
        : `No ${tabLabel} tickets${activeFilter ? ` from ${CHANNEL_FILTERS.find(channel => channel.id === activeFilter)?.label ?? activeFilter}` : ""}.`
      }
    </div>
  )
}
