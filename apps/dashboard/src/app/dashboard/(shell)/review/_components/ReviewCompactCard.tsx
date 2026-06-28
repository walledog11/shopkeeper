import Image from "next/image"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import {
  actionLogEntryHref,
  formatActionLogHeadline,
} from "@/lib/agent/action-log-display"
import { formatRelativeTime } from "@/lib/format/date"
import { getActionLogChannelInfo } from "@/lib/messaging/channels"
import type { ActionLogEntry } from "@/types"
import {
  MODE_LABELS,
  primaryPreviewText,
  reviewItemChrome,
} from "./quality-panel-model"
import {
  REVIEW_ICONS,
  REVIEW_TONE_CLASS,
  ReviewFeedbackControls,
  sourceLinkLabel,
} from "./ReviewItemShared"
import type { ReviewFeedback } from "./useReviewFeedback"

export function ReviewCompactCard({
  entry,
  feedback,
  isPeek = false,
  isNew,
  onFeedbackChange,
  onOpen,
}: {
  entry: ActionLogEntry
  feedback: ReviewFeedback
  isPeek?: boolean
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
      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-foreground/55">
        {primaryPreviewText(entry)}
      </p>
    </>
  )

  return (
    <article
      aria-hidden={isPeek || undefined}
      className={`rounded-lg border border-border bg-card px-4 py-4 shadow-sm transition-colors ${tone.border}`}
    >
      {isPeek ? (
        <div className="block w-full border-0 bg-transparent p-0 text-left [font-family:inherit]">{body}</div>
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
          <ReviewFeedbackControls
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
