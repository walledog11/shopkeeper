import { AlertTriangle } from "lucide-react"

export type PillState = "working" | "needs-attention" | "waiting" | "not-connected"

export function StatusPill({ state }: { state: PillState }) {
  switch (state) {
    case 'waiting':
      return (
        <output className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/55 bg-foreground/[0.03] border border-foreground/15 rounded-full px-3 py-1">
          <span className="size-1.5 rounded-full bg-foreground/40" />
          Waiting for first message
        </output>
      )
    case 'needs-attention':
      return (
        <output className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-600/[0.05] border border-amber-600/30 rounded-full px-3 py-1">
          <AlertTriangle className="size-3.5" />
          Needs attention
        </output>
      )
    case 'not-connected':
    default:
      return (
        <output className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground border border-border rounded-full px-3 py-1">
          <span className="size-1.5 rounded-full bg-foreground/25" />
          Not connected
        </output>
      )
  }
}
