"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, Loader2, MessageSquare } from "lucide-react"
import { useActionLogEntries } from "@/hooks/useActionLogEntries"
import { HOME_SUMMARY_REFRESH_INTERVAL_MS } from "@/lib/home/summary-contract"
import AutonomyReadinessCard from "./AutonomyReadinessCard"
import { ReviewCard } from "./ReviewCard"
import {
  emptyStates,
  FOCUS_OPTIONS,
  groupByDay,
  parseFromParam,
  resolveFocus,
  type Focus,
} from "./quality-panel-model"

function SkeletonCard() {
  return (
    <div className="px-5 py-4 border-b border-foreground/[0.05] animate-pulse">
      <div className="flex items-center gap-2">
        <div className="size-6 rounded-lg bg-foreground/[0.07]" />
        <div className="h-3 w-28 rounded bg-foreground/[0.07]" />
        <div className="h-3 w-16 rounded bg-foreground/[0.05]" />
      </div>
      <div className="mt-3 pl-8">
        <div className="h-16 rounded-lg bg-foreground/[0.04]" />
      </div>
    </div>
  )
}

const LAST_VISIT_KEY = "shopkeeper:review:lastVisit"

function useLastVisit(): string | null {
  const [lastVisit] = useState<string | null>(() => (
    typeof window === "undefined" ? null : window.localStorage.getItem(LAST_VISIT_KEY)
  ))
  useEffect(() => {
    window.localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString())
  }, [])
  return lastVisit
}

export default function QualityPanel({ agentName }: { agentName: string }) {
  const searchParams = useSearchParams()
  const { replace } = useRouter()
  const focus = resolveFocus(searchParams.get("focus"))
  const fromParam = searchParams.get("from")
  const lastVisit = useLastVisit()

  const setFocusAndUrl = useCallback((next: Focus) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("focus", next)
    replace(`/dashboard/review?${params.toString()}`)
  }, [replace, searchParams])

  const focusConfig = FOCUS_OPTIONS.find((option) => option.id === focus) ?? FOCUS_OPTIONS[0]
  const filters = useMemo(() => ({
    ...focusConfig.filters,
    from: parseFromParam(fromParam),
  }), [focusConfig, fromParam])

  const {
    entries: allEntries,
    isLoading,
    error,
    hasMore,
    isLoadingMore,
    loadMore,
  } = useActionLogEntries(filters, {
    refreshInterval: HOME_SUMMARY_REFRESH_INTERVAL_MS,
    revalidateOnFocus: true,
  })

  const dayGroups = useMemo(() => groupByDay(allEntries), [allEntries])
  const fromLabel = fromParam === "24h" ? " in the last 24 hours" : ""
  const emptyState = emptyStates(agentName)[focus]

  return (
    <>
      <div className="px-5 py-4 border-b border-foreground/[0.06]">
        <AutonomyReadinessCard />

        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {FOCUS_OPTIONS.map((opt) => {
            const active = opt.id === focus
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFocusAndUrl(opt.id)}
                className={`text-xs font-semibold px-2.5 h-6 rounded border transition-colors ${
                  active
                    ? "bg-foreground/[0.12] text-white border-foreground/[0.18]"
                    : "bg-foreground/[0.04] text-foreground/55 border-foreground/[0.08] hover:bg-foreground/[0.08] hover:text-foreground/80"
                }`}
              >
                {opt.label}
              </button>
            )
          })}
          {fromParam === "24h" && (
            <span className="text-xs text-foreground/35 ml-1">{"\u00b7"} Last 24 hours</span>
          )}
        </div>
      </div>

      {isLoading && allEntries.length === 0 ? (
        <div>
          {Array.from({ length: 6 }, (_, i) => `review-skeleton-${i}`).map((key) => (
            <SkeletonCard key={key} />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <p className="text-sm text-foreground/50">Failed to load agent outputs.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 text-xs text-foreground/30 hover:text-foreground/60 transition-colors"
          >
            Try again
          </button>
        </div>
      ) : allEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <div className="size-10 rounded-xl bg-foreground/[0.06] flex items-center justify-center mb-4">
            {focus === "attention" ? (
              <Eye className="size-5 text-foreground/30" />
            ) : (
              <MessageSquare className="size-5 text-foreground/30" />
            )}
          </div>
          <p className="text-sm font-medium text-foreground/60 mb-1">{emptyState.title}</p>
          <p className="text-xs text-foreground/30 max-w-xs">
            {fromLabel ? `No outputs match this lens${fromLabel}.` : emptyState.body}
          </p>
        </div>
      ) : (
        <>
          {dayGroups.map((group) => (
            <div key={group.key}>
              <div className="px-5 pt-4 pb-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-foreground/35">
                  {group.label}
                </p>
              </div>
              {group.entries.map((entry) => (
                <ReviewCard
                  key={entry.id}
                  entry={entry}
                  focus={focus}
                  isNew={lastVisit !== null && entry.sentAt > lastVisit}
                />
              ))}
            </div>
          ))}

          <div className="flex justify-center py-6">
            {hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="text-xs font-medium text-foreground/35 hover:text-foreground/60 disabled:opacity-40 transition-colors inline-flex items-center gap-1.5"
              >
                {isLoadingMore ? <Loader2 className="size-3 animate-spin" /> : null}
                {isLoadingMore ? "Loading…" : "Load more"}
              </button>
            ) : (
              <p className="text-xs text-foreground/40">You&apos;re all caught up</p>
            )}
          </div>
        </>
      )}
    </>
  )
}
