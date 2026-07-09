"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useActionLogEntries } from "@/hooks/useActionLogEntries"
import { HOME_SUMMARY_REFRESH_INTERVAL_MS } from "@/lib/home/summary-contract"
import AutonomyReadinessCard from "./AutonomyReadinessCard"
import { ReviewBoard, type ReviewBoardState } from "./ReviewBoard"
import {
  STORE_ACTION_TOOLS,
  REVIEW_BOARD_COLUMNS,
  classifyReviewItem,
  type ReviewColumnId,
} from "./quality-panel-model"

const LAST_VISIT_KEY = "shopkeeper:review:lastVisit"
const QUERY_OPTIONS = {
  refreshInterval: HOME_SUMMARY_REFRESH_INTERVAL_MS,
  revalidateOnFocus: true,
}
const FULL_BOARD_COLUMN_IDS = REVIEW_BOARD_COLUMNS.map((column) => column.id)

function useLastVisit(): string | null {
  const [lastVisit] = useState<string | null>(() => (
    typeof window === "undefined" ? null : window.localStorage.getItem(LAST_VISIT_KEY)
  ))
  useEffect(() => {
    window.localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString())
  }, [])
  return lastVisit
}

function entriesForColumn(entries: ReturnType<typeof useActionLogEntries>["entries"], columnId: ReviewColumnId) {
  return entries.filter((entry) => classifyReviewItem(entry) === columnId)
}

export default function QualityPanel({ agentName }: { agentName: string }) {
  const lastVisit = useLastVisit()

  const attentionFilters = useMemo(() => ({
    attention: true,
    excludeOperator: true,
  }), [])

  const autoFilters = useMemo(() => ({
    modes: ["auto_executed" as const],
    excludeOperator: true,
  }), [])

  const storeFilters = useMemo(() => ({
    tools: [...STORE_ACTION_TOOLS],
  }), [])

  const approvedFilters = useMemo(() => ({
    modes: ["human_approved" as const, "read_only" as const],
  }), [])

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

  const isNew = useCallback(
    (entry: { sentAt: string }) => lastVisit !== null && entry.sentAt > lastVisit,
    [lastVisit],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative z-20 shrink-0 px-3 pt-3 pb-3 empty:hidden">
        <AutonomyReadinessCard />
      </div>

      <ReviewBoard
        columns={columns}
        isNew={isNew}
        visibleColumnIds={FULL_BOARD_COLUMN_IDS}
      />
    </div>
  )
}
