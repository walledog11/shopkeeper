"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useActionLogEntries } from "@/hooks/useActionLogEntries"
import { HOME_SUMMARY_REFRESH_INTERVAL_MS } from "@/lib/home/summary-contract"
import AutonomyReadinessCard from "./AutonomyReadinessCard"
import { ReviewBoard, type ReviewBoardState } from "./ReviewBoard"
import {
  STORE_ACTION_TOOLS,
  FOCUS_OPTIONS,
  classifyReviewItem,
  columnsForFocus,
  parseFromParam,
  resolveFocus,
  type Focus,
  type ReviewColumnId,
} from "./quality-panel-model"

const LAST_VISIT_KEY = "shopkeeper:review:lastVisit"
const GLASS_SHELL_CLASS =
  "space-y-2 rounded-[22px] border border-foreground/[0.08] bg-card/60 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_50px_rgba(43,33,24,0.13)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-card/45"

const GLASS_CONTROL_CLASS =
  "border border-foreground/[0.08] bg-background/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-background/28"
const QUERY_OPTIONS = {
  refreshInterval: HOME_SUMMARY_REFRESH_INTERVAL_MS,
  revalidateOnFocus: true,
}

function useLastVisit(): string | null {
  const [lastVisit] = useState<string | null>(() => (
    typeof window === "undefined" ? null : window.localStorage.getItem(LAST_VISIT_KEY)
  ))
  useEffect(() => {
    window.localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString())
  }, [])
  return lastVisit
}

function replaceReviewUrl(replace: ReturnType<typeof useRouter>["replace"], params: URLSearchParams) {
  const qs = params.toString()
  replace(qs ? `/dashboard/review?${qs}` : "/dashboard/review")
}

function entriesForColumn(entries: ReturnType<typeof useActionLogEntries>["entries"], columnId: ReviewColumnId) {
  return entries.filter((entry) => classifyReviewItem(entry) === columnId)
}

export default function QualityPanel({ agentName }: { agentName: string }) {
  const searchParams = useSearchParams()
  const { replace } = useRouter()
  const focus = resolveFocus(searchParams.get("focus"))
  const fromParam = searchParams.get("from")
  const from = useMemo(() => parseFromParam(fromParam), [fromParam])
  const lastVisit = useLastVisit()

  const setFocusAndUrl = useCallback((next: Focus) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === "all") params.delete("focus")
    else params.set("focus", next)
    replaceReviewUrl(replace, params)
  }, [replace, searchParams])

  const setTimeWindow = useCallback((next: "24h" | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next) params.set("from", next)
    else params.delete("from")
    replaceReviewUrl(replace, params)
  }, [replace, searchParams])

  const attentionFilters = useMemo(() => ({
    attention: true,
    excludeOperator: true,
    from,
  }), [from])

  const autoFilters = useMemo(() => ({
    modes: ["auto_executed" as const],
    excludeOperator: true,
    from,
  }), [from])

  const storeFilters = useMemo(() => ({
    tools: [...STORE_ACTION_TOOLS],
    from,
  }), [from])

  const approvedFilters = useMemo(() => ({
    modes: ["human_approved" as const, "read_only" as const],
    from,
  }), [from])

  const attentionQuery = useActionLogEntries(attentionFilters, QUERY_OPTIONS)
  const autoQuery = useActionLogEntries(autoFilters, QUERY_OPTIONS)
  const storeQuery = useActionLogEntries(storeFilters, QUERY_OPTIONS)
  const approvedQuery = useActionLogEntries(approvedFilters, QUERY_OPTIONS)

  const columns: ReviewBoardState = useMemo(() => ({
    attention: {
      entries: entriesForColumn(attentionQuery.entries, "attention"),
      error: attentionQuery.error,
      hasMore: attentionQuery.hasMore,
      isLoading: attentionQuery.isLoading,
      isLoadingMore: attentionQuery.isLoadingMore,
      onLoadMore: attentionQuery.loadMore,
      onRetry: attentionQuery.refresh,
    },
    auto: {
      entries: entriesForColumn(autoQuery.entries, "auto"),
      error: autoQuery.error,
      hasMore: autoQuery.hasMore,
      isLoading: autoQuery.isLoading,
      isLoadingMore: autoQuery.isLoadingMore,
      onLoadMore: autoQuery.loadMore,
      onRetry: autoQuery.refresh,
    },
    store: {
      entries: entriesForColumn(storeQuery.entries, "store"),
      error: storeQuery.error,
      hasMore: storeQuery.hasMore,
      isLoading: storeQuery.isLoading,
      isLoadingMore: storeQuery.isLoadingMore,
      onLoadMore: storeQuery.loadMore,
      onRetry: storeQuery.refresh,
    },
    approved: {
      entries: entriesForColumn(approvedQuery.entries, "approved"),
      error: approvedQuery.error,
      hasMore: approvedQuery.hasMore,
      isLoading: approvedQuery.isLoading,
      isLoadingMore: approvedQuery.isLoadingMore,
      onLoadMore: approvedQuery.loadMore,
      onRetry: approvedQuery.refresh,
    },
  }), [attentionQuery, autoQuery, storeQuery, approvedQuery])

  const visibleColumnIds = useMemo(() => columnsForFocus(focus), [focus])
  const hasCustomFrom = Boolean(fromParam && fromParam !== "24h")
  const isNew = useCallback(
    (entry: { sentAt: string }) => lastVisit !== null && entry.sentAt > lastVisit,
    [lastVisit],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative z-20 shrink-0 px-3 pt-3 pb-3">
        <div className={GLASS_SHELL_CLASS}>
          <AutonomyReadinessCard />

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className={`flex min-w-0 flex-wrap items-center gap-1.5 rounded-full px-2 py-1 ${GLASS_CONTROL_CLASS}`}>
              {FOCUS_OPTIONS.map((opt) => {
                const active = opt.id === focus
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFocusAndUrl(opt.id)}
                    className={`h-7 rounded-full px-3 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-foreground/[0.12] text-white"
                        : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-strong"
                    }`}
                  >
                    {opt.id === "all" ? "Full board" : opt.label}
                  </button>
                )
              })}
            </div>

            <div className={`flex shrink-0 items-center gap-1 rounded-full px-1 py-1 ${GLASS_CONTROL_CLASS}`}>
              <button
                type="button"
                onClick={() => setTimeWindow(null)}
                className={`h-7 rounded-full px-3 text-xs font-semibold transition-colors ${
                  !fromParam
                    ? "bg-foreground/[0.12] text-white"
                    : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-strong"
                }`}
              >
                All time
              </button>
              <button
                type="button"
                onClick={() => setTimeWindow("24h")}
                className={`h-7 rounded-full px-3 text-xs font-semibold transition-colors ${
                  fromParam === "24h"
                    ? "bg-foreground/[0.12] text-white"
                    : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-strong"
                }`}
              >
                24h
              </button>
              {hasCustomFrom && (
                <span className="px-2 text-xs font-medium text-faint">Custom</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <ReviewBoard
        columns={columns}
        isNew={isNew}
        visibleColumnIds={visibleColumnIds}
      />
    </div>
  )
}
