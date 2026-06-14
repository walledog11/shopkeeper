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
      <div className="text-center p-8 text-foreground/40 text-sm">
        No results for &ldquo;{searchQuery}&rdquo;
      </div>
    )
  }

  if (totalCount === 0 && !searchQuery && !activeFilter) {
    return (
      <div className="flex flex-col items-center text-center p-8 gap-3">
        <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
          <Inbox className="size-5 text-foreground/30" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground/70 mb-1">No conversations yet</p>
          <p className="text-xs text-foreground/45 mb-3">Connect a channel and customer messages will land here.</p>
          <Link href="/dashboard/integrations" className="text-xs font-semibold text-foreground/60 hover:text-foreground transition-colors">
            Set up integrations →
          </Link>
        </div>
      </div>
    )
  }

  const tabLabel = activeTab === "filtered" ? "spam" : activeTab === "closed" ? "closed" : "open"

  return (
    <div className="text-center p-8 text-foreground/40 text-sm">
      {searchQuery
        ? `No results for "${searchQuery}"`
        : `No ${tabLabel} conversations${activeFilter ? ` from ${CHANNEL_FILTERS.find(channel => channel.id === activeFilter)?.label ?? activeFilter}` : ""}.`
      }
    </div>
  )
}
