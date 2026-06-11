import { AlertTriangle } from "lucide-react"
import type { PillState } from "./integration-card-types"

export function StatusPill({ state }: { state: PillState }) {
  switch (state) {
    case 'waiting':
      return (
        <span role="status" className="inline-flex items-center gap-1.5 text-xs font-medium text-white/55 bg-white/[0.03] border border-white/15 rounded-full px-3 py-1">
          <span className="size-1.5 rounded-full bg-white/40" />
          Waiting for first message
        </span>
      )
    case 'needs-attention':
      return (
        <span role="status" className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300 bg-amber-400/[0.05] border border-amber-400/30 rounded-full px-3 py-1">
          <AlertTriangle className="size-3.5" />
          Needs attention
        </span>
      )
    case 'not-connected':
    default:
      return (
        <span role="status" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-full px-3 py-1">
          <span className="size-1.5 rounded-full bg-white/25" />
          Not connected
        </span>
      )
  }
}
