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
      <div className="text-center p-8 text-faint text-sm">
        No results for &ldquo;{searchQuery}&rdquo;
      </div>
    )
  }

  if (totalCount === 0 && !searchQuery && !channelFilter && !tagFilter) {
    if (activeView === "for_me") {
      return (
        <EmptyStatePanel
          icon={<CheckCircle2 className="size-5 text-faint" />}
          title="You're all caught up"
          description="Nothing needs your reply right now."
          action={
            <button
              type="button"
              onClick={() => onViewChange("all_open")}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse all conversations →
            </button>
          }
        />
      )
    }

    if (activeView === "spam") {
      return (
        <div className="text-center p-8 text-faint text-sm">
          No spam messages.
        </div>
      )
    }

    return (
      <EmptyStatePanel
        icon={<Inbox className="size-5 text-faint" />}
        title="No conversations yet"
        description="Connect a channel and customer messages will land here."
        action={
          <Link href="/dashboard/integrations" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
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
    <div className="text-center p-8 text-faint text-sm">
      {searchQuery
        ? `No results for "${searchQuery}"`
        : `No ${viewLabel} conversations${filterParts.length > 0 ? ` ${filterParts.join(", ")}` : ""}.`
      }
    </div>
  )
}
