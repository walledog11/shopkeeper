"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { DashboardDetailDialog } from "@/app/dashboard/_components/board/DashboardDetailDialog"
import { dashboardPageShellClassName } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { FilterPill } from "@/components/ui/search-filter-bar"
import { Skeleton } from "@/components/ui/skeleton"
import { boardCardShellClassName } from "@/lib/ui/board-card-styles"
import { cn } from "@/lib/ui/cn"
import type { ActionLogEntry } from "@/types"
import {
  REVIEW_FILTERS,
  type ReviewFilterId,
} from "./quality-panel-model"
import { ReviewDetail } from "./ReviewDetail"
import { ReviewRow } from "./ReviewRow"
import { useReviewFeedback } from "./useReviewFeedback"

export interface ReviewListState {
  entries: ActionLogEntry[]
  error: unknown
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  onRetry: () => void
}

export function ReviewList({
  state,
  activeFilter,
  isNew,
  onFilterChange,
}: {
  state: ReviewListState
  activeFilter: ReviewFilterId
  isNew: (entry: ActionLogEntry) => boolean
  onFilterChange: (filter: ReviewFilterId) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { changeFeedback, feedbackFor } = useReviewFeedback()
  const config = REVIEW_FILTERS.find(filter => filter.id === activeFilter) ?? REVIEW_FILTERS[0]
  const selectedEntry = selectedId
    ? state.entries.find(entry => entry.id === selectedId) ?? null
    : null

  return (
    <>
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className={dashboardPageShellClassName()}>
          <div
            className="flex flex-wrap items-center gap-2.5"
            role="group"
            aria-label="Filter the audit trail"
          >
            {REVIEW_FILTERS.map(filter => (
              <FilterPill
                key={filter.id}
                pressed={filter.id === activeFilter}
                onClick={() => onFilterChange(filter.id)}
              >
                {filter.label}
              </FilterPill>
            ))}
          </div>

          {state.isLoading && state.entries.length === 0 ? (
            <div
              data-testid="review-list-loading"
              className="flex flex-col gap-3"
            >
              {[0, 1, 2, 3].map(index => (
                <Skeleton
                  key={`review-row-skeleton-${index}`}
                  className={cn(boardCardShellClassName(), "h-28 rounded-3xl bg-foreground/[0.06]")}
                />
              ))}
            </div>
          ) : state.error ? (
            <div className={cn(boardCardShellClassName(), "px-5 py-8 text-center")}>
              <p className="text-sm font-semibold text-muted-foreground">That didn&apos;t load</p>
              <button
                type="button"
                onClick={state.onRetry}
                className="mt-3 rounded-2xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-strong"
              >
                Try again
              </button>
            </div>
          ) : state.entries.length === 0 ? (
            <div className={cn(boardCardShellClassName(), "border-dashed px-6 py-12 text-center")}>
              <p className="text-sm font-semibold text-muted-foreground">{config.emptyTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-faint">{config.emptyBody}</p>
            </div>
          ) : (
            <>
              <ul data-testid="review-list" className="flex flex-col gap-3">
                {state.entries.map(entry => (
                  <ReviewRow
                    key={entry.id}
                    entry={entry}
                    feedback={feedbackFor(entry)}
                    isNew={isNew(entry)}
                    onFeedbackChange={next => changeFeedback(entry, next)}
                    onOpen={() => setSelectedId(entry.id)}
                  />
                ))}
              </ul>

              {state.hasMore && (
                <div className="flex justify-center py-4">
                  <button
                    type="button"
                    onClick={state.onLoadMore}
                    disabled={state.isLoadingMore}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-strong disabled:opacity-50"
                  >
                    {state.isLoadingMore && <Loader2 className="size-3 animate-spin" />}
                    Show older
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <DashboardDetailDialog
        open={Boolean(selectedEntry)}
        title="Review detail"
        maxWidthClassName="sm:max-w-3xl lg:max-w-5xl"
        onClose={() => setSelectedId(null)}
      >
        {selectedEntry ? (
          <ReviewDetail
            entry={selectedEntry}
            feedback={feedbackFor(selectedEntry)}
            onClose={() => setSelectedId(null)}
            onFeedbackChange={next => changeFeedback(selectedEntry, next)}
          />
        ) : null}
      </DashboardDetailDialog>
    </>
  )
}
