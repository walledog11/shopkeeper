"use client"

import { useMemo, useState, type ComponentType } from "react"
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  PackageCheck,
} from "lucide-react"
import { DashboardDetailDialog } from "@/app/dashboard/_components/board/DashboardDetailDialog"
import {
  BoardColumnEmpty,
  BoardColumnError,
  BoardColumnLoading,
  DashboardStackColumn,
} from "@/app/dashboard/_components/board/DashboardStackColumn"
import { STACKED_BELOW_PEEK } from "@/app/dashboard/_components/home/needs-you-motion"
import type { ActionLogEntry } from "@/types"
import {
  REVIEW_BOARD_COLUMNS,
  type ReviewColumnId,
} from "./quality-panel-model"
import { ReviewCompactCard } from "./ReviewCompactCard"
import { ReviewDetail } from "./ReviewDetail"
import { useReviewFeedback } from "./useReviewFeedback"

export interface ReviewColumnState {
  entries: ActionLogEntry[]
  error: unknown
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  onRetry: () => void
}

export type ReviewBoardState = Record<ReviewColumnId, ReviewColumnState>

interface ReviewBoardProps {
  columns: ReviewBoardState
  isNew: (entry: ActionLogEntry) => boolean
  visibleColumnIds: ReviewColumnId[]
}

const COLUMN_ACCENT: Record<ReviewColumnId, {
  dot: string
  icon: ComponentType<{ className?: string }>
}> = {
  attention: { dot: "bg-rose-500", icon: AlertTriangle },
  auto: { dot: "bg-sky-500", icon: Bot },
  store: { dot: "bg-amber-500", icon: PackageCheck },
  approved: { dot: "bg-emerald-500", icon: CheckCircle2 },
}

function ReviewStackColumn({
  columnId,
  state,
  expanded,
  isNew,
  feedbackFor,
  onExpandedChange,
  onFeedbackChange,
  onOpenEntry,
}: {
  columnId: ReviewColumnId
  state: ReviewColumnState
  expanded: boolean
  isNew: (entry: ActionLogEntry) => boolean
  feedbackFor: ReturnType<typeof useReviewFeedback>["feedbackFor"]
  onExpandedChange: (expanded: boolean) => void
  onFeedbackChange: ReturnType<typeof useReviewFeedback>["changeFeedback"]
  onOpenEntry: (entry: ActionLogEntry) => void
}) {
  const config = REVIEW_BOARD_COLUMNS.find(column => column.id === columnId) ?? REVIEW_BOARD_COLUMNS[0]
  const accent = COLUMN_ACCENT[columnId]
  const loading = useMemo(() => (
    <BoardColumnLoading
      testId="review-column-loading"
      keyPrefix="review-board-skeleton"
      cardClassName="h-40 rounded-3xl"
    />
  ), [])
  const errorContent = useMemo(
    () => <BoardColumnError className="rounded-3xl" onRetry={state.onRetry} />,
    [state.onRetry],
  )
  const empty = useMemo(() => (
    <BoardColumnEmpty
      title={config.emptyTitle}
      body={config.emptyBody}
      icon={accent.icon}
      className="h-40 rounded-3xl"
    />
  ), [accent.icon, config.emptyBody, config.emptyTitle])

  return (
    <DashboardStackColumn
      label={config.label}
      description={config.description}
      state={state}
      icon={accent.icon}
      accentDotClassName={accent.dot}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      getId={entry => entry.id}
      onOpenItem={onOpenEntry}
      renderCard={(entry, { isPeek, onOpen }) => (
        <ReviewCompactCard
          entry={entry}
          feedback={feedbackFor(entry)}
          isPeek={isPeek}
          isNew={!isPeek && isNew(entry)}
          onFeedbackChange={next => onFeedbackChange(entry, next)}
          onOpen={onOpen}
        />
      )}
      deckLabels={{ previous: "Previous review item", next: "Next review item" }}
      stackTestId="review-stack-deck"
      expandedTestId="review-stack-expanded"
      loading={loading}
      errorContent={errorContent}
      empty={empty}
      peek={STACKED_BELOW_PEEK}
      stackSingleItem
      peekShellClassName="h-full w-full rounded-3xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] box-border"
      peekCardClassName="pointer-events-none box-border overflow-hidden rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]"
    />
  )
}

export function ReviewBoard({
  columns,
  isNew,
  visibleColumnIds,
}: ReviewBoardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedColumns, setExpandedColumns] = useState<Partial<Record<ReviewColumnId, boolean>>>({})
  const { changeFeedback, feedbackFor } = useReviewFeedback()
  const allEntries = useMemo(
    () => Object.values(columns).flatMap(column => column.entries),
    [columns],
  )
  const selectedEntry = selectedId
    ? allEntries.find(entry => entry.id === selectedId) ?? null
    : null

  return (
    <>
      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-4">
          {visibleColumnIds.map(columnId => (
            <ReviewStackColumn
              key={columnId}
              columnId={columnId}
              state={columns[columnId]}
              expanded={expandedColumns[columnId] ?? false}
              isNew={isNew}
              feedbackFor={feedbackFor}
              onExpandedChange={expanded => {
                setExpandedColumns(current => ({ ...current, [columnId]: expanded }))
              }}
              onFeedbackChange={changeFeedback}
              onOpenEntry={entry => setSelectedId(entry.id)}
            />
          ))}
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
