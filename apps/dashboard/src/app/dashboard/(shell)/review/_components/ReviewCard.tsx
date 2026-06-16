"use client"

import { useCallback, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, ThumbsDown, ThumbsUp } from "lucide-react"
import {
  actionLogEntryHref,
  correctReplyHref,
  formatActionLogHeadline,
} from "@/lib/agent/action-log-display"
import { formatRelativeTime } from "@/lib/format/date"
import { getActionLogChannelInfo } from "@/lib/messaging/channels"
import type { ActionLogEntry } from "@/types"
import {
  isErrorStatus,
  MODE_LABELS,
  outcomeActions,
  outcomeTone,
  TONE_STYLES,
  toolLabel,
  toOutputBlock,
  type Focus,
  type OutputBlock,
} from "./quality-panel-model"

export function ReviewCard({ entry, focus, isNew }: { entry: ActionLogEntry; focus: Focus; isNew: boolean }) {
  const channel = getActionLogChannelInfo(entry)
  const href = actionLogEntryHref(entry)
  const headline = formatActionLogHeadline(entry)

  const outputs = entry.actions.map(toOutputBlock).filter((b): b is OutputBlock => b !== null)
  const outcomes = outcomeActions(entry)
  const hasReply = outputs.some((block) => block.tone === "reply")
  const bodyOutcomes = outputs.length === 0 ? outcomes : []
  const footnoteOutcomes = outputs.length === 0 ? [] : outcomes

  return (
    <div className="border-b border-foreground/[0.05] px-5 py-4 hover:bg-foreground/[0.02] transition-colors group">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="size-6 rounded-lg bg-foreground/[0.06] border border-foreground/[0.08] flex items-center justify-center shrink-0">
          <Image src={channel.logo} alt={channel.name} width={13} height={13} className="object-contain" />
        </div>
        {href ? (
          <Link href={href} className="text-sm font-semibold text-foreground/80 truncate hover:text-white">
            {headline}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-foreground/80 truncate">{headline}</span>
        )}
        {isNew && (
          <span className="text-xs font-semibold text-emerald-300 bg-emerald-900/[0.25] border border-emerald-800/40 px-1.5 py-0.5 rounded">
            New
          </span>
        )}
        {focus === "all" && entry.mode && (
          <span className="text-xs font-bold uppercase tracking-wide text-foreground/40 bg-foreground/[0.05] border border-foreground/[0.08] px-1.5 py-0.5 rounded">
            {MODE_LABELS[entry.mode]}
          </span>
        )}
        {entry.threadTag && (
          <span className="text-xs font-medium text-foreground/40 bg-foreground/[0.05] border border-foreground/[0.08] px-1.5 py-0.5 rounded">
            {entry.threadTag}
          </span>
        )}
        {href ? (
          <Link href={href} className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-foreground/25">{formatRelativeTime(entry.sentAt)}</span>
            <ArrowRight className="size-3 text-foreground/15 group-hover:text-foreground/40 transition-colors" />
          </Link>
        ) : (
          <span className="ml-auto text-xs text-foreground/25 shrink-0">{formatRelativeTime(entry.sentAt)}</span>
        )}
      </div>

      {outputs.length > 0 && (
        <div className="mt-3 space-y-2 pl-8">
          {outputs.map((block) => {
            const tone = TONE_STYLES[block.tone]
            return (
              <div key={block.key} className={`rounded-lg border p-3 ${tone.container}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${tone.label}`}>
                  {block.label}
                </p>
                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">
                  {block.text}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {bodyOutcomes.length > 0 && (
        <div className="mt-3 space-y-2 pl-8">
          {bodyOutcomes.map((action, idx) => {
            const tone = TONE_STYLES[outcomeTone(action)]
            return (
              <div key={`${action.tool}-${idx}`} className={`rounded-lg border p-3 ${tone.container}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${tone.label}`}>
                  {toolLabel(action.tool)}
                </p>
                {action.result && (
                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">
                    {action.result}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {outputs.length === 0 && bodyOutcomes.length === 0 && entry.summary && (
        <p className="mt-2 pl-8 text-sm text-foreground/50">{entry.summary}</p>
      )}

      {footnoteOutcomes.length > 0 && (
        <div className="mt-2 pl-8 space-y-1">
          {footnoteOutcomes.map((action, idx) => {
            const isError = isErrorStatus(action.status)
            return (
              <div key={`${action.tool}-${idx}`} className="flex items-baseline gap-2 text-xs">
                <span className={`font-semibold shrink-0 ${isError ? "text-red-300" : "text-foreground/55"}`}>
                  {toolLabel(action.tool)}
                </span>
                {action.result && <span className="text-foreground/40 truncate">{action.result}</span>}
              </div>
            )
          })}
        </div>
      )}

      <FeedbackRow entry={entry} hasReply={hasReply} />
    </div>
  )
}

function FeedbackRow({ entry, hasReply }: { entry: ActionLogEntry; hasReply: boolean }) {
  const [feedbackOverride, setFeedbackOverride] = useState<ActionLogEntry["feedback"] | undefined>(undefined)
  const feedback = feedbackOverride === undefined ? entry.feedback : feedbackOverride
  const correctHref = correctReplyHref(entry)
  const showLooksGood = entry.mode === "auto_executed"
  const showSoundsOff = hasReply && correctHref !== null

  const toggleGood = useCallback(async () => {
    const previous = feedback
    const next = previous === "good" ? null : "good"
    setFeedbackOverride(next)
    try {
      const res = await fetch("/api/agent/actions/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnId: entry.id, feedback: next }),
      })
      if (!res.ok) throw new Error("feedback failed")
    } catch {
      setFeedbackOverride(previous)
    }
  }, [entry.id, feedback])

  if (!showLooksGood && !showSoundsOff) return null

  return (
    <div className="mt-2 pl-8 flex items-center gap-4">
      {showLooksGood && (
        <button
          type="button"
          onClick={toggleGood}
          className={`inline-flex items-center gap-1 text-xs font-semibold transition-colors ${
            feedback === "good"
              ? "text-emerald-300"
              : "text-foreground/40 hover:text-emerald-200"
          }`}
        >
          <ThumbsUp className="size-3" />
          {feedback === "good" ? "Looked good" : "Looks good"}
        </button>
      )}
      {showSoundsOff && correctHref && (
        <Link
          href={correctHref}
          className="inline-flex items-center gap-1 text-xs font-semibold text-foreground/40 hover:text-amber-200 transition-colors"
        >
          <ThumbsDown className="size-3" />
          Sounds off
        </Link>
      )}
    </div>
  )
}
