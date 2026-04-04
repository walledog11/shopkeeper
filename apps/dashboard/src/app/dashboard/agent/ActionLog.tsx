"use client"

import { useState, useEffect, useCallback } from "react"
import { AlertCircle, Check, ChevronDown, ExternalLink, Loader2 } from "lucide-react"
import type { ActionLogEntry } from "@/types"
import { TOOL_LABELS } from "@/lib/agent/tools"

const CHANNEL_LABELS: Record<string, string> = {
  email:           "Email",
  ig_dm:           "Instagram",
  dashboard_agent: "Dashboard",
  sms:             "SMS",
  sms_agent:       "SMS Agent",
  tiktok:          "TikTok",
  shopify:         "Shopify",
}

const CHANNEL_COLORS: Record<string, string> = {
  email:           "bg-blue-50 text-blue-700",
  ig_dm:           "bg-pink-50 text-pink-700",
  dashboard_agent: "bg-violet-50 text-violet-700",
  sms:             "bg-emerald-50 text-emerald-700",
  sms_agent:       "bg-emerald-50 text-emerald-700",
  tiktok:          "bg-slate-100 text-slate-700",
  shopify:         "bg-green-50 text-green-700",
}

function formatTimestamp(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined })
}

export default function ActionLog({ sidebarLimit }: { sidebarLimit?: number }) {
  const [entries, setEntries] = useState<ActionLogEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const fetchPage = useCallback(async (cursor?: string) => {
    const url = cursor ? `/api/agent/actions?cursor=${encodeURIComponent(cursor)}` : "/api/agent/actions"
    const res = await fetch(url)
    if (!res.ok) throw new Error("Failed to load action log")
    return res.json() as Promise<{ entries: ActionLogEntry[]; nextCursor: string | null }>
  }, [])

  useEffect(() => {
    fetchPage()
      .then(({ entries, nextCursor }) => {
        setEntries(entries)
        setNextCursor(nextCursor)
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false))
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const { entries: more, nextCursor: next } = await fetchPage(nextCursor)
      setEntries((prev) => [...prev, ...more])
      setNextCursor(next)
    } catch {
      // silent
    } finally {
      setIsLoadingMore(false)
    }
  }, [nextCursor, isLoadingMore, fetchPage])

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center ${sidebarLimit ? "h-16" : "h-64"}`}>
        <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center gap-2 text-xs text-red-500 ${sidebarLimit ? "h-16" : "h-64"}`}>
        <AlertCircle className="w-3.5 h-3.5" />
        {error}
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
          <div key={entry.id} className="px-4 py-3 border-b border-slate-100 last:border-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    CHANNEL_COLORS[entry.channelType] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {CHANNEL_LABELS[entry.channelType] ?? entry.channelType}
                </span>
                <span className="text-xs text-slate-600 truncate">{entry.customerHandle}</span>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0">{formatTimestamp(entry.sentAt)}</span>
            </div>
            <p className="text-xs text-slate-500 truncate">{entry.summary}</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {entry.actions.slice(0, 3).map((action: { tool: string; result: string }, i: number) => {
                const isError = action.result.startsWith("Error")
                return (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-0.5 text-[10px] rounded px-1.5 py-0.5 ${
                      isError ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {isError
                      ? <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                      : <Check className="w-2.5 h-2.5 shrink-0" />
                    }
                    {TOOL_LABELS[action.tool] ?? action.tool}
                  </span>
                )
              })}
              {entry.actions.length > 3 && (
                <span className="text-[10px] text-slate-400">+{entry.actions.length - 3} more</span>
              )}
            </div>
          </div>
        ))}
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full text-xs text-slate-500 hover:text-violet-700 py-2.5 transition-colors"
          >
            Show {hiddenCount} more
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-6 space-y-3">
      {visibleEntries.map((entry) => (
        <div key={entry.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
          {/* Row 1: timestamp + channel + customer + thread link */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400">{formatTimestamp(entry.sentAt)}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                CHANNEL_COLORS[entry.channelType] ?? "bg-slate-100 text-slate-600"
              }`}
            >
              {CHANNEL_LABELS[entry.channelType] ?? entry.channelType}
            </span>
            <span className="text-xs text-slate-600 font-medium">{entry.customerHandle}</span>
            {entry.threadTag && (
              <span className="text-xs text-slate-400">· {entry.threadTag}</span>
            )}
            {entry.channelType !== "dashboard_agent" && (
              <a
                href={`/dashboard/tickets?thread=${entry.threadId}`}
                className="ml-auto flex items-center gap-1 text-xs text-violet-600 hover:underline"
              >
                View thread
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Row 2: instruction (if present) */}
          {entry.instruction && (
            <p className="text-xs text-slate-500 italic truncate">&ldquo;{entry.instruction}&rdquo;</p>
          )}

          {/* Row 3: summary */}
          <p className="text-sm text-slate-800">{entry.summary}</p>

          {/* Row 4: action chips */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {entry.actions.map((action: { tool: string; result: string }, i: number) => {
              const isError = action.result.startsWith("Error")
              return (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 ${
                    isError
                      ? "bg-red-50 text-red-600"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {isError
                    ? <AlertCircle className="w-3 h-3 shrink-0" />
                    : <Check className="w-3 h-3 shrink-0" />
                  }
                  {TOOL_LABELS[action.tool] ?? action.tool}
                </span>
              )
            })}
          </div>
        </div>
      ))}

      {nextCursor && (
        <div className="flex justify-center pt-2">
          <button
            onClick={loadMore}
            disabled={isLoadingMore}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-40"
          >
            {isLoadingMore ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            Load more
          </button>
        </div>
      )}
    </div>
  )
}
