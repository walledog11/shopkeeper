"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useActionLogEntries } from "@/hooks/useActionLogEntries"
import { HOME_SUMMARY_REFRESH_INTERVAL_MS } from "@/lib/home/summary-contract"
import { ReviewList } from "./ReviewList"
import { REVIEW_FILTERS, type ReviewFilterId } from "./quality-panel-model"

const LAST_VISIT_KEY = "shopkeeper:review:lastVisit"
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

export default function QualityPanel() {
  const lastVisit = useLastVisit()
  const [activeFilter, setActiveFilter] = useState<ReviewFilterId>("all")

  const filters = useMemo(
    () => (REVIEW_FILTERS.find(filter => filter.id === activeFilter) ?? REVIEW_FILTERS[0]).query,
    [activeFilter],
  )
  const query = useActionLogEntries(filters, QUERY_OPTIONS)

  const state = useMemo(() => ({
    entries: query.entries,
    error: query.error,
    hasMore: query.hasMore,
    isLoading: query.isLoading,
    isLoadingMore: query.isLoadingMore,
    onLoadMore: query.loadMore,
    onRetry: query.refresh,
  }), [query])

  const isNew = useCallback(
    (entry: { sentAt: string }) => lastVisit !== null && entry.sentAt > lastVisit,
    [lastVisit],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ReviewList
        state={state}
        activeFilter={activeFilter}
        isNew={isNew}
        onFilterChange={setActiveFilter}
      />
    </div>
  )
}
