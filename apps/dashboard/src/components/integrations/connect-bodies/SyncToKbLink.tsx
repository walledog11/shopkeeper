"use client"

import { BookOpen, Loader2 } from "lucide-react"
import { cn } from "@/lib/ui/cn"

export function SyncToKbLink({
  syncing,
  result,
  onSync,
}: {
  syncing: boolean
  result: string | null
  onSync: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={syncing}
        onClick={onSync}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/40 hover:text-foreground/70 transition-colors disabled:opacity-50"
      >
        {syncing
          ? <><Loader2 className="size-3.5 animate-spin" />Syncing…</>
          : <><BookOpen className="size-3.5" />Sync to KB</>
        }
      </button>
      {result && (
        <span className={cn(
          "text-xs",
          result.startsWith("Sync failed") ? "text-red-400" : "text-emerald-400",
        )}>
          {result}
        </span>
      )}
    </div>
  )
}
