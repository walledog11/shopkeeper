import Link from "next/link"
import { CheckCircle2, Inbox } from "lucide-react"
import { EmptyState as EmptyStatePanel } from "@/components/ui/empty-state"
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
        <EmptyStatePanel
          icon={<CheckCircle2 className="size-5 text-foreground/40" />}
          title="You're all caught up"
          description="Nothing needs your reply right now."
          action={
            <button
              type="button"
              onClick={() => onViewChange("all_open")}
              className="text-xs font-semibold text-foreground/60 hover:text-foreground transition-colors"
            >
              Browse all open tickets →
            </button>
          }
        />
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
      <EmptyStatePanel
        icon={<Inbox className="size-5 text-foreground/30" />}
        title="No conversations yet"
        description="Connect a channel and customer messages will land here."
        action={
          <Link href="/dashboard/integrations" className="text-xs font-semibold text-foreground/60 hover:text-foreground transition-colors">
            Set up integrations →
          </Link>
        }
      />
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
