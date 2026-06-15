"use client"

import { Inbox } from "lucide-react"

const TICKET_SKELETON_KEYS = [
  "ticket-skeleton-1",
  "ticket-skeleton-2",
  "ticket-skeleton-3",
  "ticket-skeleton-4",
  "ticket-skeleton-5",
  "ticket-skeleton-6",
]

export function TicketsLoadingState() {
  return (
    <div className="flex size-full overflow-hidden bg-background">
      <div className="w-full md:w-72 md:min-w-[260px] md:max-w-[300px] shrink-0 border-r border-border flex flex-col bg-background">
        <div className="px-3 pt-3 pb-2 border-b border-border space-y-2">
          <div className="h-9 bg-white/[0.04] rounded-md animate-pulse" />
          <div className="h-8 bg-white/[0.04] rounded-md animate-pulse" />
          <div className="h-9 bg-white/[0.04] rounded-md animate-pulse" />
        </div>
        <div className="flex-1 divide-y divide-white/[0.05]">
          {TICKET_SKELETON_KEYS.map((key) => (
            <div key={key} className="px-4 py-3.5 animate-pulse space-y-2">
              <div className="flex justify-between">
                <div className="h-3 w-24 bg-white/[0.06] rounded" />
                <div className="h-3 w-10 bg-white/[0.04] rounded" />
              </div>
              <div className="h-3 w-40 bg-white/[0.05] rounded" />
              <div className="h-3 w-32 bg-white/[0.04] rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="hidden md:flex flex-1 items-center justify-center bg-background">
        <div className="size-14 rounded-md bg-white/[0.05] border border-border flex items-center justify-center">
          <Inbox className="size-6 text-white/20" />
        </div>
      </div>
    </div>
  )
}

export function TicketsErrorState() {
  return (
    <div className="flex size-full items-center justify-center bg-background">
      <div className="text-red-400 text-sm font-medium">Failed to connect to database.</div>
    </div>
  )
}
