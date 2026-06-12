"use client"

import { useState } from "react"
import { AlertCircle, Check, ChevronDown, ExternalLink, Loader2 } from "lucide-react"
import type { ActionLogEntry } from "@/types"
import { TOOL_LABELS } from "@shopkeeper/agent/tools"
import { useActionLogEntries } from "@/hooks/useActionLogEntries"
import { formatRelativeTimestamp } from "@/lib/format/date"
import { getChannelBadgeClassName, getChannelLabel } from "@/lib/messaging/channels"

function entryTitle(entry: ActionLogEntry): string {
  return entry.customerHandle ?? entry.instruction ?? "Workspace action"
}

export default function ActionLog({ sidebarLimit }: { sidebarLimit?: number }) {
  const [showAll, setShowAll] = useState(false)
  const { entries, isLoading, isLoadingMore, error, hasMore, loadMore } = useActionLogEntries()

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center ${sidebarLimit ? "h-16" : "h-64"}`}>
        <Loader2 className="size-4 animate-spin text-violet-500" />
      </div>
    )
  }

  if (error) {
    const message = error instanceof Error ? error.message : "Failed to load action log"
    return (
      <div className={`flex items-center justify-center gap-2 text-xs text-red-500 ${sidebarLimit ? "h-16" : "h-64"}`}>
        <AlertCircle className="size-3.5" />
        {message}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center gap-1 text-slate-400 ${sidebarLimit ? "py-6" : "h-64"}`}>
        <p className="text-xs">No agent actions yet.</p>
      </div>
    )
  }

  const visibleEntries =
    sidebarLimit && !showAll ? entries.slice(0, sidebarLimit) : entries
  const hiddenCount = sidebarLimit ? entries.length - visibleEntries.length : 0

  if (sidebarLimit) {
    // Compact sidebar mode
    return (
      <div>
        {visibleEntries.map((entry) => (
          <div key={entry.id} className="px-4 py-3 border-b border-border last:border-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
                    getChannelBadgeClassName(entry.channelType)
                  }`}
                >
                  {getChannelLabel(entry.channelType)}
                </span>
                <span className="text-xs text-muted-foreground truncate">{entryTitle(entry)}</span>
              </div>
              <span className="text-xs text-muted-foreground/70 shrink-0">{formatRelativeTimestamp(entry.sentAt)}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{entry.summary}</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {entry.actions.slice(0, 3).map((action: { tool: string; result: string }) => {
                const isError = action.result.startsWith("Error")
                return (
                  <span
                    key={`${action.tool}-${action.result}`}
                    className={`inline-flex items-center gap-0.5 text-xs rounded px-1.5 py-0.5 ${
                      isError ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"
                    }`}
                  >
                    {isError
                      ? <AlertCircle className="size-2.5 shrink-0" />
                      : <Check className="size-2.5 shrink-0" />
                    }
                    {TOOL_LABELS[action.tool] ?? action.tool}
                  </span>
                )
              })}
              {entry.actions.length > 3 && (
                <span className="text-xs text-slate-400">+{entry.actions.length - 3} more</span>
              )}
            </div>
          </div>
        ))}
        {hiddenCount > 0 && (
          <button type="button"
            onClick={() => setShowAll(true)}
            className="w-full text-xs text-muted-foreground hover:text-violet-400 py-2.5 transition-colors"
          >
            Show {hiddenCount} more
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-5 py-4 space-y-2">
      {visibleEntries.map((entry) => (
        <div key={entry.id} className="bg-card border border-border rounded-lg p-3 space-y-2">
          {/* Row 1: timestamp + channel + customer + thread link */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">{formatRelativeTimestamp(entry.sentAt)}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                getChannelBadgeClassName(entry.channelType)
              }`}
            >
              {getChannelLabel(entry.channelType)}
            </span>
            <span className="text-xs text-foreground font-medium">{entryTitle(entry)}</span>
            {entry.threadTag && (
              <span className="text-xs text-muted-foreground">· {entry.threadTag}</span>
            )}
            {entry.threadId && entry.channelType !== "dashboard_agent" && (
              <a
                href={`/dashboard/tickets?thread=${entry.threadId}`}
                className="ml-auto flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
              >
                View ticket
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>

          {/* Row 2: instruction (if present) */}
          {entry.instruction && (
            <p className="text-xs text-muted-foreground italic truncate">&ldquo;{entry.instruction}&rdquo;</p>
          )}

          {/* Row 3: summary */}
          <p className="text-sm text-foreground">{entry.summary}</p>

          {/* Row 4: action chips */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {entry.actions.map((action: { tool: string; result: string }) => {
              const isError = action.result.startsWith("Error")
              return (
                <span
                  key={`${action.tool}-${action.result}`}
                  className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 ${
                    isError
                      ? "bg-red-500/15 text-red-400"
                      : "bg-emerald-500/15 text-emerald-400"
                  }`}
                >
                  {isError
                    ? <AlertCircle className="size-3 shrink-0" />
                    : <Check className="size-3 shrink-0" />
                  }
                  {TOOL_LABELS[action.tool] ?? action.tool}
                </span>
              )
            })}
          </div>
        </div>
      ))}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <button type="button"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            {isLoadingMore ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ChevronDown className="size-4" />
            )}
            Load more
          </button>
        </div>
      )}
    </div>
  )
}
