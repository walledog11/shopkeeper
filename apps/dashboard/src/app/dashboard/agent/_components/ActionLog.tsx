"use client"

import { useReducer, useEffect, useCallback } from "react"
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
  email:           "bg-blue-500/15 text-blue-400",
  ig_dm:           "bg-pink-500/15 text-pink-400",
  dashboard_agent: "bg-violet-500/15 text-violet-400",
  sms:             "bg-emerald-500/15 text-emerald-400",
  sms_agent:       "bg-emerald-500/15 text-emerald-400",
  tiktok:          "bg-slate-500/15 text-slate-400",
  shopify:         "bg-green-500/15 text-green-400",
}

interface ActionLogState {
  entries: ActionLogEntry[]
  nextCursor: string | null
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  showAll: boolean
}

type ActionLogAction =
  | { type: "loaded"; entries: ActionLogEntry[]; nextCursor: string | null }
  | { type: "loadError"; error: string }
  | { type: "loadMoreStart" }
  | { type: "loadMoreSuccess"; entries: ActionLogEntry[]; nextCursor: string | null }
  | { type: "loadMoreEnd" }
  | { type: "showAll" }

const initialActionLogState: ActionLogState = {
  entries: [],
  nextCursor: null,
  isLoading: true,
  isLoadingMore: false,
  error: null,
  showAll: false,
}

function actionLogReducer(state: ActionLogState, action: ActionLogAction): ActionLogState {
  switch (action.type) {
    case "loaded":
      return { ...state, entries: action.entries, nextCursor: action.nextCursor, isLoading: false }
    case "loadError":
      return { ...state, error: action.error, isLoading: false }
    case "loadMoreStart":
      return { ...state, isLoadingMore: true }
    case "loadMoreSuccess":
      return {
        ...state,
        entries: [...state.entries, ...action.entries],
        nextCursor: action.nextCursor,
        isLoadingMore: false,
      }
    case "loadMoreEnd":
      return { ...state, isLoadingMore: false }
    case "showAll":
      return { ...state, showAll: true }
  }
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
  const [state, dispatch] = useReducer(actionLogReducer, initialActionLogState)
  const { entries, nextCursor, isLoading, isLoadingMore, error, showAll } = state

  const fetchPage = useCallback(async (cursor?: string) => {
    const url = cursor ? `/api/agent/actions?cursor=${encodeURIComponent(cursor)}` : "/api/agent/actions"
    const res = await fetch(url)
    if (!res.ok) throw new Error("Failed to load action log")
    return res.json() as Promise<{ entries: ActionLogEntry[]; nextCursor: string | null }>
  }, [])

  useEffect(() => {
    fetchPage()
      .then(({ entries, nextCursor }) => dispatch({ type: "loaded", entries, nextCursor }))
      .catch((err) => dispatch({ type: "loadError", error: err instanceof Error ? err.message : "Failed to load action log" }))
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return
    dispatch({ type: "loadMoreStart" })
    try {
      const { entries: more, nextCursor: next } = await fetchPage(nextCursor)
      dispatch({ type: "loadMoreSuccess", entries: more, nextCursor: next })
    } catch {
      dispatch({ type: "loadMoreEnd" })
    }
  }, [nextCursor, isLoadingMore, fetchPage])

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center ${sidebarLimit ? "h-16" : "h-64"}`}>
        <Loader2 className="size-4 animate-spin text-violet-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center gap-2 text-xs text-red-500 ${sidebarLimit ? "h-16" : "h-64"}`}>
        <AlertCircle className="size-3.5" />
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
          <div key={entry.id} className="px-4 py-3 border-b border-border last:border-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
                    CHANNEL_COLORS[entry.channelType] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {CHANNEL_LABELS[entry.channelType] ?? entry.channelType}
                </span>
                <span className="text-xs text-muted-foreground truncate">{entry.customerHandle}</span>
              </div>
              <span className="text-xs text-muted-foreground/70 shrink-0">{formatTimestamp(entry.sentAt)}</span>
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
            onClick={() => dispatch({ type: "showAll" })}
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
            <span className="text-xs text-muted-foreground">{formatTimestamp(entry.sentAt)}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                CHANNEL_COLORS[entry.channelType] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {CHANNEL_LABELS[entry.channelType] ?? entry.channelType}
            </span>
            <span className="text-xs text-foreground font-medium">{entry.customerHandle}</span>
            {entry.threadTag && (
              <span className="text-xs text-muted-foreground">· {entry.threadTag}</span>
            )}
            {entry.channelType !== "dashboard_agent" && (
              <a
                href={`/dashboard/tickets?thread=${entry.threadId}`}
                className="ml-auto flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
              >
                View thread
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

      {nextCursor && (
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
