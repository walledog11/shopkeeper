import Link from "next/link"
import { CheckCircle2, Inbox } from "lucide-react"
import { buildChannelFilters, type TicketListView, type TicketTagFilter } from "./constants"
import type { ChannelType } from "@/types"

interface EmptyStateProps {
  activeView: TicketListView
  channelFilter: ChannelType | null
  connectedChannels: ChannelType[]
  isSearchMode?: boolean
  searchQuery: string
  tagFilter: TicketTagFilter | null
  totalCount: number
  onViewChange: (view: TicketListView) => void
}

export function EmptyState({
  activeView,
  channelFilter,
  connectedChannels,
  isSearchMode,
  searchQuery,
  tagFilter,
  totalCount,
  onViewChange,
}: EmptyStateProps) {
  if (isSearchMode) {
    return (
      <div className="text-center p-8 text-foreground/40 text-sm">
        No results for &ldquo;{searchQuery}&rdquo;
      </div>
    )
  }

  if (totalCount === 0 && !searchQuery && !channelFilter && !tagFilter) {
    if (activeView === "for_me") {
      return (
        <div className="flex flex-col items-center text-center p-8 gap-3">
          <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
            <CheckCircle2 className="size-5 text-foreground/40" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground/70 mb-1">You&apos;re caught up</p>
            <p className="text-xs text-foreground/45 mb-3">
              Nothing needs your reply right now.
            </p>
            <button
              type="button"
              onClick={() => onViewChange("all_open")}
              className="text-xs font-semibold text-foreground/60 hover:text-foreground transition-colors"
            >
              Browse all open tickets →
            </button>
          </div>
        </div>
      )
    }

    if (activeView === "spam") {
      return (
        <div className="text-center p-8 text-foreground/40 text-sm">
          No spam messages.
        </div>
      )
    }

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

  const channelLabel = channelFilter
    ? buildChannelFilters(connectedChannels).find(channel => channel.id === channelFilter)?.label ?? channelFilter
    : null
  const viewLabel = activeView === "spam"
    ? "spam"
    : activeView === "closed"
      ? "closed"
      : activeView === "all_open"
        ? "open"
        : "for you"

  const filterParts = [
    tagFilter ? `tagged ${tagFilter}` : null,
    channelLabel ? `from ${channelLabel}` : null,
  ].filter(Boolean)

  return (
    <div className="text-center p-8 text-foreground/40 text-sm">
      {searchQuery
        ? `No results for "${searchQuery}"`
        : `No ${viewLabel} conversations${filterParts.length > 0 ? ` ${filterParts.join(", ")}` : ""}.`
      }
    </div>
  )
}
