import Image from "next/image"
import {
  buildChannelFilters,
  getTagStyle,
  TICKET_TAG_FILTERS,
  type TicketTagFilter,
} from "./constants"
import type { ChannelType } from "@/types"

interface TicketListFiltersPanelProps {
  channelFilter: ChannelType | null
  connectedChannels: ChannelType[]
  spamCount: number
  tagFilter: TicketTagFilter | null
  onChannelFilterChange: (id: ChannelType | null) => void
  onTagFilterChange: (tag: TicketTagFilter | null) => void
  onViewSpam: () => void
}

export function TicketListFiltersPanel({
  channelFilter,
  connectedChannels,
  spamCount,
  tagFilter,
  onChannelFilterChange,
  onTagFilterChange,
  onViewSpam,
}: TicketListFiltersPanelProps) {
  const channelFilters = buildChannelFilters(connectedChannels)

  return (
    <div className="space-y-3">
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
    </div>
  )
}
