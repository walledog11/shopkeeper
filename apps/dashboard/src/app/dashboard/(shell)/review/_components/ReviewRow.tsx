import Link from "next/link"
import { ExternalLink } from "lucide-react"
import {
  actionLogEntryHref,
  formatActionLogHeadline,
} from "@/lib/agent/action-log-display"
import { formatRelativeTime } from "@/lib/format/date"
import { getActionLogChannelInfo } from "@/lib/messaging/channels"
import { boardCardShellClassName } from "@/lib/ui/board-card-styles"
import { cn } from "@/lib/ui/cn"
import type { ActionLogEntry } from "@/types"
import {
  primaryPreviewText,
  reviewItemChrome,
  reviewModeNote,
} from "./quality-panel-model"
import {
  REVIEW_ICONS,
  REVIEW_TONE_CLASS,
  ReviewFeedbackControls,
  sourceLinkLabel,
} from "./ReviewItemShared"
import type { ReviewFeedback } from "./useReviewFeedback"

export function ReviewRow({
  entry,
  feedback,
  isNew,
  onFeedbackChange,
  onOpen,
}: {
  entry: ActionLogEntry
  feedback: ReviewFeedback
  isNew: boolean
  onFeedbackChange: (next: ReviewFeedback) => void
  onOpen: () => void
}) {
  const channel = getActionLogChannelInfo(entry)
  const headline = formatActionLogHeadline(entry)
  const href = actionLogEntryHref(entry)
  const sourceLabel = sourceLinkLabel(href)
  const chrome = reviewItemChrome(entry)
  const Icon = REVIEW_ICONS[chrome.icon]
  const tone = REVIEW_TONE_CLASS[chrome.tone]
  const modeNote = reviewModeNote(entry)

  return (
    <li className={cn(boardCardShellClassName(), "list-none")}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 rounded-t-3xl px-4 pt-4 text-left [font-family:inherit] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/70 sm:px-5"
      >
        <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-2xl border ${tone.icon}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="truncate text-sm font-semibold text-strong">{headline}</h3>
            <span className="shrink-0 text-xs tabular-nums text-faint">
              {formatRelativeTime(entry.sentAt)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone.badge}`}>
              {chrome.label}
            </span>
            <span className="text-xs text-faint">{channel.name}</span>
            {modeNote && <span className="text-xs text-faint">· {modeNote}</span>}
            {isNew && (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                New
              </span>
            )}
            {feedback === "good" && (
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                Good
              </span>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {primaryPreviewText(entry)}
          </p>
        </div>
      </button>

      <div className="flex items-center justify-between gap-3 rounded-b-3xl border-t border-border/50 bg-muted/30 px-4 pb-4 pt-3 pl-[3.75rem] sm:px-5 sm:pl-[4.25rem]">
        {href && sourceLabel ? (
          <Link
            href={href}
            className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-faint transition-colors hover:text-strong"
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{sourceLabel}</span>
          </Link>
        ) : (
          <span className="text-xs text-faint">No source link</span>
        )}
        <ReviewFeedbackControls
          entry={entry}
          feedback={feedback}
          onFeedbackChange={onFeedbackChange}
          compact
        />
      </div>
    </li>
  )
}
