"use client"

import { Loader2, Search } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import { boardSoftShadowClassName } from "@/lib/ui/board-card-styles"

export function InboxControls({
  searchQuery,
  isSearchLoading,
  includeClosed,
  onSearchChange,
  onToggleClosed,
}: {
  searchQuery: string
  isSearchLoading: boolean
  includeClosed: boolean
  onSearchChange: (value: string) => void
  onToggleClosed: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#6b5d4f]/60" aria-hidden />
        <input
          type="search"
          value={searchQuery}
          onChange={event => onSearchChange(event.target.value)}
          placeholder="Search conversations"
          aria-label="Search conversations"
          className={cn(
            boardSoftShadowClassName,
            "h-10 w-full rounded-2xl border border-border bg-white pl-10 pr-10 text-sm text-[#1a1a1a] outline-none transition-colors placeholder:text-[#6b5d4f]/60 focus:border-foreground/25 [&::-webkit-search-cancel-button]:appearance-none",
          )}
        />
        {isSearchLoading && (
          <Loader2 aria-hidden className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-[#6b5d4f]/60" />
        )}
      </div>

      <button
        type="button"
        data-testid="inbox-toggle-closed"
        aria-pressed={includeClosed}
        onClick={onToggleClosed}
        className={cn(
          boardSoftShadowClassName,
          "h-10 shrink-0 rounded-2xl px-4 text-xs font-semibold transition-colors",
          includeClosed
            ? "bg-[#1a1a1a] text-white"
            : "bg-white text-[#6b5d4f] hover:text-[#1a1a1a]",
        )}
      >
        Closed
      </button>
    </div>
  )
}
