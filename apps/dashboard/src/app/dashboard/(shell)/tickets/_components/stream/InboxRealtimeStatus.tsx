"use client"

import { REALTIME_ENABLED } from "@/lib/realtime/config"
import { useRealtimeConnectionStatus } from "@/components/realtime/RealtimeConnectionContext"
import { cn } from "@/lib/ui/cn"

export function InboxRealtimeStatus() {
  const status = useRealtimeConnectionStatus()

  if (!REALTIME_ENABLED || status === "disabled" || status === "live") return null

  const label = status === "connecting"
    ? "Connecting to live updates…"
    : "Reconnecting to live updates…"

  return (
    <p
      role="status"
      data-testid="inbox-realtime-status"
      className={cn(
        "mb-3 rounded-xl border border-amber-600/20 bg-amber-600/[0.08] px-3 py-2 text-xs text-amber-800",
      )}
    >
      {label}
    </p>
  )
}
