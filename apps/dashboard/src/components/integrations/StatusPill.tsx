import { AlertTriangle } from "lucide-react"
import type { PillState } from "./integration-card-types"

export function StatusPill({ state }: { state: PillState }) {
  switch (state) {
    case 'working':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-400/[0.08] border border-emerald-400/[0.20] rounded-full px-2 py-0.5">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Working
        </span>
      )
    case 'waiting':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/55 bg-white/[0.05] border border-white/[0.12] rounded-full px-2 py-0.5">
          <span className="size-1.5 rounded-full bg-white/40" />
          Waiting for first message
        </span>
      )
    case 'needs-attention':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-400/[0.08] border border-amber-400/[0.20] rounded-full px-2 py-0.5">
          <AlertTriangle className="size-3" />
          Needs attention
        </span>
      )
    case 'not-connected':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/30 border border-white/[0.10] rounded-full px-2 py-0.5">
          <span className="size-1.5 rounded-full bg-white/20" />
          Not connected
        </span>
      )
  }
}
