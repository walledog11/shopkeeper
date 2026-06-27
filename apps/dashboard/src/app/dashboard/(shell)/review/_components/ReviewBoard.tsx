"use client"

import { useCallback, useMemo, useState, type ComponentType, type ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MessageSquare,
  NotebookText,
  PackageCheck,
  ThumbsDown,
  ThumbsUp,
  Wrench,
} from "lucide-react"
import { DashboardDetailDialog } from "@/app/dashboard/_components/board/DashboardDetailDialog"
import {
  BoardColumnEmpty,
  BoardColumnError,
  BoardColumnLoading,
  DashboardStackColumn,
} from "@/app/dashboard/_components/board/DashboardStackColumn"
import {
  actionLogEntryHref,
  correctReplyHref,
  formatActionLogHeadline,
} from "@/lib/agent/action-log-display"
import { formatRelativeTime } from "@/lib/format/date"
import { getActionLogChannelInfo } from "@/lib/messaging/channels"
import type { ActionLogEntry } from "@/types"
import {
  MODE_LABELS,
  REVIEW_BOARD_COLUMNS,
  TONE_STYLES,
  isErrorStatus,
  outcomeActions,
  outcomeTone,
  primaryPreviewText,
  reviewItemChrome,
  toOutputBlock,
  toolLabel,
  type OutputBlock,
  type ReviewColumnId,
  type ReviewIconKey,
  type ReviewItemTone,
} from "./quality-panel-model"

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

type Feedback = ActionLogEntry["feedback"]

const ICONS: Record<ReviewIconKey, ComponentType<{ className?: string }>> = {
  alert: AlertTriangle,
  check: CheckCircle2,
  message: MessageSquare,
  note: NotebookText,
  store: PackageCheck,
  tool: Wrench,
}

const COLUMN_ACCENT: Record<ReviewColumnId, { dot: string; icon: ComponentType<{ className?: string }> }> = {
  attention: { dot: "bg-rose-500", icon: AlertTriangle },
  auto: { dot: "bg-sky-500", icon: Bot },
  store: { dot: "bg-amber-500", icon: PackageCheck },
  approved: { dot: "bg-emerald-500", icon: CheckCircle2 },
}

const TONE_CLASS: Record<ReviewItemTone, { icon: string; badge: string; border: string }> = {
  attention: {
    icon: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    border: "hover:border-amber-500/25",
  },
  auto: {
    icon: "border-sky-500/20 bg-sky-500/10 text-sky-300",
    badge: "border-sky-500/20 bg-sky-500/10 text-sky-200",
    border: "hover:border-sky-500/25",
  },
  store: {
    icon: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    border: "hover:border-amber-500/25",
  },
  approved: {
    icon: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    border: "hover:border-emerald-500/25",
  },
  error: {
    icon: "border-red-500/20 bg-red-500/10 text-red-300",
    badge: "border-red-500/20 bg-red-500/10 text-red-200",
    border: "hover:border-red-500/25",
  },
  note: {
    icon: "border-foreground/[0.10] bg-foreground/[0.05] text-foreground/55",
    badge: "border-foreground/[0.08] bg-foreground/[0.04] text-foreground/50",
    border: "hover:border-foreground/[0.16]",
  },
}

function sourceLinkLabel(href: string | null): string | null {
  if (!href) return null
  if (href.startsWith("/dashboard/orders")) return "Open order"
  if (href.startsWith("/dashboard/tickets")) return "Open ticket"
  if (href.includes("openAgent=1")) return "Open agent session"
  return "Open source"
}

function hasReplyOutput(entry: ActionLogEntry): boolean {
  return entry.actions.some((action, idx) => toOutputBlock(action, idx)?.tone === "reply")
}

function displayFeedback(entry: ActionLogEntry, override: Feedback | undefined): Feedback {
  return override === undefined ? entry.feedback : override
}

function FeedbackControls({
  entry,
  feedback,
  onFeedbackChange,
  compact = false,
}: {
  entry: ActionLogEntry
  feedback: Feedback
  onFeedbackChange: (next: Feedback) => void
  compact?: boolean
}) {
  const correctionHref = correctReplyHref(entry)
  const showLooksGood = entry.mode === "auto_executed"
  const showSoundsOff = hasReplyOutput(entry) && correctionHref !== null

  if (!showLooksGood && !showSoundsOff) return null

  return (
    <div className={`flex items-center gap-3 ${compact ? "text-[11px]" : "text-xs"}`}>
      {showLooksGood && (
        <button
          type="button"
          onClick={() => onFeedbackChange(feedback === "good" ? null : "good")}
          className={`inline-flex items-center gap-1 font-semibold transition-colors ${
            feedback === "good"
              ? "text-emerald-300"
              : "text-foreground/40 hover:text-emerald-200"
          }`}
        >
          <ThumbsUp className="size-3" />
          {feedback === "good" ? "Looked good" : "Looks good"}
        </button>
      )}
      {showSoundsOff && correctionHref && (
        <Link
          href={correctionHref}
          className="inline-flex items-center gap-1 font-semibold text-foreground/40 transition-colors hover:text-amber-200"
        >
          <ThumbsDown className="size-3" />
          Sounds off
        </Link>
      )}
    </div>
  )
}

function ReviewCompactCard({
  entry,
  feedback,
  isPeek = false,
  isNew,
  onFeedbackChange,
  onOpen,
}: {
  entry: ActionLogEntry
  feedback: Feedback
  isPeek?: boolean
  isNew: boolean
  onFeedbackChange: (next: Feedback) => void
  onOpen: () => void
}) {
  const channel = getActionLogChannelInfo(entry)
  const headline = formatActionLogHeadline(entry)
  const href = actionLogEntryHref(entry)
  const sourceLabel = sourceLinkLabel(href)
  const preview = primaryPreviewText(entry)
  const chrome = reviewItemChrome(entry)
  const Icon = ICONS[chrome.icon]
  const tone = TONE_CLASS[chrome.tone]

  const body = (
    <>
        <div className="flex items-center gap-3">
          <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground/90">{headline}</h3>
              <span className="shrink-0 text-xs tabular-nums text-foreground/35">
                {formatRelativeTime(entry.sentAt)}
              </span>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <Image src={channel.logo} alt={channel.name} width={12} height={12} className="size-3 object-contain" />
              <span className="truncate text-xs text-foreground/40">{channel.name}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone.badge}`}>
            {chrome.label}
          </span>
          {entry.mode && (
            <span className="rounded-full border border-foreground/[0.08] bg-foreground/[0.04] px-2 py-0.5 text-xs font-medium text-foreground/45">
              {MODE_LABELS[entry.mode]}
            </span>
          )}
          {isNew && (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-200">
              New
            </span>
          )}
          {feedback === "good" && (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-200">
              Good
            </span>
          )}
        </div>

        <p className="mt-3 text-sm leading-relaxed text-foreground/55 line-clamp-3">
          {preview}
        </p>
    </>
  )

  return (
    <article
      aria-hidden={isPeek || undefined}
      className={`rounded-lg border border-border bg-card px-4 py-4 shadow-sm transition-colors ${tone.border}`}
    >
      {isPeek ? (
        <div className="block w-full border-0 bg-transparent p-0 text-left [font-family:inherit]">
          {body}
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full border-0 bg-transparent p-0 text-left [font-family:inherit] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/70"
        >
          {body}
        </button>
      )}

      <div className="mt-4 flex min-h-5 items-center justify-between gap-3">
        {isPeek ? (
          <span className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-foreground/35">
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{sourceLabel ?? "No source link"}</span>
          </span>
        ) : href && sourceLabel ? (
          <Link
            href={href}
            className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-foreground/40 transition-colors hover:text-foreground/75"
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{sourceLabel}</span>
          </Link>
        ) : (
          <span className="text-xs text-foreground/30">No source link</span>
        )}
        {!isPeek && (
          <FeedbackControls
            entry={entry}
            feedback={feedback}
            onFeedbackChange={onFeedbackChange}
            compact
          />
        )}
      </div>
    </article>
  )
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/35">{title}</h3>
      {children}
    </section>
  )
}

function OutputBlockView({ block }: { block: OutputBlock }) {
  const tone = TONE_STYLES[block.tone]

  return (
    <div className={`rounded-lg border p-3 ${tone.container}`}>
      <p className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${tone.label}`}>
        {block.label}
      </p>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/80">
        {block.text}
      </p>
    </div>
  )
}

function statusClassName(status: ActionLogEntry["actions"][number]["status"]): string {
  if (status === "success") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
  if (status === "escalated") return "border-amber-500/20 bg-amber-500/10 text-amber-200"
  if (status === "error" || status === "policy_block") return "border-red-500/20 bg-red-500/10 text-red-200"
  return "border-foreground/[0.08] bg-foreground/[0.04] text-foreground/45"
}

function ReviewDetail({
  entry,
  feedback,
  onClose,
  onFeedbackChange,
}: {
  entry: ActionLogEntry
  feedback: Feedback
  onClose: () => void
  onFeedbackChange: (next: Feedback) => void
}) {
  const channel = getActionLogChannelInfo(entry)
  const headline = formatActionLogHeadline(entry)
  const href = actionLogEntryHref(entry)
  const sourceLabel = sourceLinkLabel(href)
  const outputs = entry.actions.map(toOutputBlock).filter((block): block is OutputBlock => block !== null)
  const nonOutputOutcomes = outcomeActions(entry)
  const chrome = reviewItemChrome(entry)
  const Icon = ICONS[chrome.icon]
  const tone = TONE_CLASS[chrome.tone]
  const exactTime = new Date(entry.sentAt).toLocaleString()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-start gap-3">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
            <Icon className="size-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold leading-tight text-foreground">{headline}</h2>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone.badge}`}>
                {chrome.label}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/40">
              <span className="inline-flex items-center gap-1.5">
                <Image src={channel.logo} alt={channel.name} width={12} height={12} className="size-3 object-contain" />
                {channel.name}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-3" />
                {exactTime}
              </span>
              {entry.mode && <span>{MODE_LABELS[entry.mode]}</span>}
              {entry.approver && (
                <span>Approved by {entry.approver.displayName ?? entry.approver.id}</span>
              )}
              {entry.threadTag && <span>{entry.threadTag}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {entry.summary.trim() && (
          <DetailSection title="Summary">
            <p className="rounded-lg border border-border bg-foreground/[0.03] p-3 text-sm leading-relaxed text-foreground/70">
              {entry.summary}
            </p>
          </DetailSection>
        )}

        <DetailSection title="Output">
          {outputs.length > 0 ? (
            <div className="space-y-2">
              {outputs.map((block) => (
                <OutputBlockView key={block.key} block={block} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-border bg-foreground/[0.03] p-3 text-sm text-foreground/40">
              No customer-facing output recorded for this turn.
            </p>
          )}
        </DetailSection>

        <DetailSection title="Tool outcomes">
          <div className="space-y-2">
            {entry.actions.map((action, idx) => {
              const toneForOutcome = TONE_STYLES[outcomeTone(action)]
              return (
                <div
                  key={`${action.tool}-${idx}`}
                  className={`rounded-lg border p-3 ${
                    isErrorStatus(action.status)
                      ? toneForOutcome.container
                      : "border-border bg-foreground/[0.02]"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground/75">{toolLabel(action.tool)}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusClassName(action.status)}`}>
                      {action.status ?? "recorded"}
                    </span>
                    {typeof action.durationMs === "number" && (
                      <span className="text-xs text-foreground/35">{action.durationMs} ms</span>
                    )}
                  </div>
                  {action.result ? (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/60">
                      {action.result}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-foreground/35">No result text recorded.</p>
                  )}
                </div>
              )
            })}
            {nonOutputOutcomes.length === 0 && entry.actions.length === 0 && (
              <p className="rounded-lg border border-border bg-foreground/[0.03] p-3 text-sm text-foreground/40">
                No tool outcomes recorded.
              </p>
            )}
          </div>
        </DetailSection>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {href && sourceLabel && (
            <Link
              href={href}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/55 transition-colors hover:text-foreground"
            >
              <ArrowUpRight className="size-3.5" />
              {sourceLabel}
            </Link>
          )}
          <FeedbackControls
            entry={entry}
            feedback={feedback}
            onFeedbackChange={onFeedbackChange}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-md border border-border px-3 text-xs font-semibold text-foreground/55 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
        >
          Done
        </button>
      </div>
    </div>
  )
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
  feedbackFor: (entry: ActionLogEntry) => Feedback
  onExpandedChange: (expanded: boolean) => void
  onFeedbackChange: (entry: ActionLogEntry, next: Feedback) => void
  onOpenEntry: (entry: ActionLogEntry) => void
}) {
  const config = REVIEW_BOARD_COLUMNS.find((column) => column.id === columnId) ?? REVIEW_BOARD_COLUMNS[0]
  const accent = COLUMN_ACCENT[columnId]
  const loading = useMemo(() => (
    <BoardColumnLoading
      testId="review-column-loading"
      keyPrefix="review-board-skeleton"
      cardClassName="h-40 rounded-lg"
    />
  ), [])
  const errorContent = useMemo(
    () => <BoardColumnError className="rounded-lg" onRetry={state.onRetry} />,
    [state.onRetry],
  )
  const empty = useMemo(() => (
    <BoardColumnEmpty
      title={config.emptyTitle}
      body={config.emptyBody}
      icon={accent.icon}
      className="h-40 rounded-lg"
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
      getId={(entry) => entry.id}
      onOpenItem={onOpenEntry}
      renderCard={(entry, { isPeek, onOpen }) => (
        <ReviewCompactCard
          entry={entry}
          feedback={feedbackFor(entry)}
          isPeek={isPeek}
          isNew={!isPeek && isNew(entry)}
          onFeedbackChange={(next) => onFeedbackChange(entry, next)}
          onOpen={onOpen}
        />
      )}
      deckLabels={{ previous: "Previous review item", next: "Next review item" }}
      stackTestId="review-stack-deck"
      expandedTestId="review-stack-expanded"
      loading={loading}
      errorContent={errorContent}
      empty={empty}
      peekShellClassName="h-full w-full rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] box-border"
      peekCardClassName="pointer-events-none box-border overflow-hidden rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]"
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
  const [feedbackOverrides, setFeedbackOverrides] = useState<Record<string, Feedback | undefined>>({})

  const allEntries = useMemo(
    () => Object.values(columns).flatMap((column) => column.entries),
    [columns],
  )
  const selectedEntry = selectedId ? allEntries.find((entry) => entry.id === selectedId) ?? null : null

  const feedbackFor = useCallback(
    (entry: ActionLogEntry) => displayFeedback(entry, feedbackOverrides[entry.id]),
    [feedbackOverrides],
  )

  const handleFeedbackChange = useCallback((entry: ActionLogEntry, next: Feedback) => {
    const previous = feedbackFor(entry)
    setFeedbackOverrides((current) => ({ ...current, [entry.id]: next }))

    void fetch("/api/agent/actions/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnId: entry.id, feedback: next }),
    }).then((res) => {
      if (!res.ok) throw new Error("feedback failed")
    }).catch(() => {
      setFeedbackOverrides((current) => ({ ...current, [entry.id]: previous }))
    })
  }, [feedbackFor])

  return (
    <>
      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-4">
          {visibleColumnIds.map((columnId) => (
            <ReviewStackColumn
              key={columnId}
              columnId={columnId}
              state={columns[columnId]}
              expanded={expandedColumns[columnId] ?? false}
              isNew={isNew}
              feedbackFor={feedbackFor}
              onExpandedChange={(expanded) => {
                setExpandedColumns((current) => ({ ...current, [columnId]: expanded }))
              }}
              onFeedbackChange={handleFeedbackChange}
              onOpenEntry={(entry) => setSelectedId(entry.id)}
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
            onFeedbackChange={(next) => handleFeedbackChange(selectedEntry, next)}
          />
        ) : null}
      </DashboardDetailDialog>
    </>
  )
}
