"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, Eye, Loader2, MessageSquare, ThumbsDown, ThumbsUp } from "lucide-react"
import { useActionLogEntries, type ActionLogQueryFilters } from "@/hooks/useActionLogEntries"
import { formatRelativeTime } from "@/lib/format/date"
import {
  actionLogEntryHref,
  correctReplyHref,
  formatActionLogHeadline,
} from "@/lib/agent/action-log-display"
import { getActionLogChannelInfo } from "@/lib/messaging/channels"
import { HOME_SUMMARY_REFRESH_INTERVAL_MS } from "@/lib/home/summary-contract"
import { TOOL_CATEGORIES, TOOL_LABELS } from "@shopkeeper/agent/tools"
import AutonomyReadinessCard from "./AutonomyReadinessCard"
import type { ActionLogEntry } from "@/types"

type Focus = "attention" | "auto" | "all"

const FOCUS_OPTIONS: {
  id: Focus
  label: string
  filters: ActionLogQueryFilters
}[] = [
  { id: "attention", label: "Needs your eyes", filters: { attention: true, excludeOperator: true } },
  { id: "auto", label: "Auto-sent", filters: { modes: ["auto_executed"], excludeOperator: true } },
  { id: "all", label: "Everything", filters: {} },
]

type Tone = "reply" | "escalate" | "money" | "error" | "note"

interface OutputBlock {
  key: string
  tool: string
  label: string
  text: string
  tone: Tone
}

const TONE_STYLES: Record<Tone, { container: string; label: string }> = {
  reply: { container: "border-emerald-800/40 bg-emerald-900/[0.12]", label: "text-emerald-300" },
  escalate: { container: "border-amber-800/40 bg-amber-900/[0.12]", label: "text-amber-300" },
  money: { container: "border-amber-800/40 bg-amber-900/[0.12]", label: "text-amber-300" },
  error: { container: "border-red-800/40 bg-red-900/[0.12]", label: "text-red-300" },
  note: { container: "border-white/[0.08] bg-white/[0.03]", label: "text-white/45" },
}

const MODE_LABELS: Record<NonNullable<ActionLogEntry["mode"]>, string> = {
  auto_executed: "Auto-sent",
  human_approved: "Approved",
  read_only: "Read only",
}

// Tools that move money or change an order — always worth the merchant's eyes.
const MONEY_TOOLS = new Set([
  "create_refund",
  "cancel_order",
  "create_shopify_order",
  "edit_shopify_order",
])

// Tools recorded outside the registry (order-ops monitor) need their own labels.
const EXTRA_TOOL_LABELS: Record<string, string> = {
  flag_order: "Flagged order",
}

function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? EXTRA_TOOL_LABELS[tool] ?? tool
}

function isFocus(value: string | null): value is Focus {
  return value === "attention" || value === "auto" || value === "all"
}

function resolveFocus(value: string | null): Focus {
  if (isFocus(value)) return value
  if (value === "escalations") return "attention"
  return "attention"
}

function parseFromParam(value: string | null): string | null {
  if (!value) return null
  if (value === "24h") return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

function field(input: unknown, key: string): string | null {
  if (input && typeof input === "object" && key in input) {
    const value = (input as Record<string, unknown>)[key]
    if (typeof value === "string" && value.trim()) return value
  }
  return null
}

function toOutputBlock(action: ActionLogEntry["actions"][number], idx: number): OutputBlock | null {
  const key = `${action.tool}-${idx}`
  switch (action.tool) {
    case "send_reply": {
      const text = field(action.input, "text")
      return text ? { key, tool: action.tool, label: "Reply to customer", text, tone: "reply" } : null
    }
    case "send_email": {
      const body = field(action.input, "body")
      if (!body) return null
      const subject = field(action.input, "subject")
      return {
        key,
        tool: action.tool,
        label: subject ? `Email · ${subject}` : "Email",
        text: body,
        tone: "reply",
      }
    }
    case "escalate_to_human": {
      const reason = field(action.input, "reason")
      return reason
        ? { key, tool: action.tool, label: "Escalated to merchant", text: reason, tone: "escalate" }
        : null
    }
    case "add_internal_note": {
      const text = field(action.input, "text")
      return text ? { key, tool: action.tool, label: "Internal note", text, tone: "note" } : null
    }
    default:
      return null
  }
}

function outcomeActions(entry: ActionLogEntry): ActionLogEntry["actions"] {
  return entry.actions.filter((action) => {
    if ((TOOL_CATEGORIES[action.tool] ?? "internal") === "read") return false
    return (
      action.tool !== "send_reply"
      && action.tool !== "send_email"
      && action.tool !== "escalate_to_human"
      && action.tool !== "add_internal_note"
    )
  })
}

function isErrorStatus(status: string | undefined): boolean {
  return status === "error" || status === "policy_block"
}

function outcomeTone(action: ActionLogEntry["actions"][number]): Tone {
  if (isErrorStatus(action.status)) return "error"
  if (MONEY_TOOLS.has(action.tool) || action.tool === "flag_order") return "money"
  return "note"
}

// Money moved, an order flagged, or anything that failed — sorts first within its day.
function isRiskEntry(entry: ActionLogEntry): boolean {
  return entry.actions.some(
    (action) =>
      MONEY_TOOLS.has(action.tool)
      || action.tool === "flag_order"
      || isErrorStatus(action.status),
  )
}

function localDayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(iso: string): string {
  const now = new Date()
  const key = localDayKey(iso)
  if (key === localDayKey(now.toISOString())) return "Today"
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (key === localDayKey(yesterday.toISOString())) return "Yesterday"
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  })
}

interface DayGroup {
  key: string
  label: string
  entries: ActionLogEntry[]
}

function groupByDay(entries: ActionLogEntry[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const entry of entries) {
    const key = localDayKey(entry.sentAt)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.entries.push(entry)
    else groups.push({ key, label: dayLabel(entry.sentAt), entries: [entry] })
  }
  // Within a day, risky turns first; each half keeps its time-desc order.
  for (const group of groups) {
    group.entries = [
      ...group.entries.filter(isRiskEntry),
      ...group.entries.filter((entry) => !isRiskEntry(entry)),
    ]
  }
  return groups
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
              : "text-white/40 hover:text-emerald-200"
          }`}
        >
          <ThumbsUp className="size-3" />
          {feedback === "good" ? "Looked good" : "Looks good"}
        </button>
      )}
      {showSoundsOff && correctHref && (
        <Link
          href={correctHref}
          className="inline-flex items-center gap-1 text-xs font-semibold text-white/40 hover:text-amber-200 transition-colors"
        >
          <ThumbsDown className="size-3" />
          Sounds off
        </Link>
      )}
    </div>
  )
}

function ReviewCard({ entry, focus, isNew }: { entry: ActionLogEntry; focus: Focus; isNew: boolean }) {
  const channel = getActionLogChannelInfo(entry)
  const href = actionLogEntryHref(entry)
  const headline = formatActionLogHeadline(entry)

  const outputs = entry.actions.map(toOutputBlock).filter((b): b is OutputBlock => b !== null)
  const outcomes = outcomeActions(entry)
  const hasReply = outputs.some((block) => block.tone === "reply")
  // Without customer-facing text the outcome is the story — promote it to the body.
  const bodyOutcomes = outputs.length === 0 ? outcomes : []
  const footnoteOutcomes = outputs.length === 0 ? [] : outcomes

  return (
    <div className="border-b border-white/[0.05] px-5 py-4 hover:bg-white/[0.02] transition-colors group">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="size-6 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
          <Image src={channel.logo} alt={channel.name} width={13} height={13} className="object-contain" />
        </div>
        {href ? (
          <Link href={href} className="text-sm font-semibold text-white/80 truncate hover:text-white">
            {headline}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-white/80 truncate">{headline}</span>
        )}
        {isNew && (
          <span className="text-xs font-semibold text-emerald-300 bg-emerald-900/[0.25] border border-emerald-800/40 px-1.5 py-0.5 rounded">
            New
          </span>
        )}
        {focus === "all" && entry.mode && (
          <span className="text-xs font-bold uppercase tracking-wide text-white/40 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded">
            {MODE_LABELS[entry.mode]}
          </span>
        )}
        {entry.threadTag && (
          <span className="text-xs font-medium text-white/40 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded">
            {entry.threadTag}
          </span>
        )}
        {href ? (
          <Link href={href} className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-white/25">{formatRelativeTime(entry.sentAt)}</span>
            <ArrowRight className="size-3 text-white/15 group-hover:text-white/40 transition-colors" />
          </Link>
        ) : (
          <span className="ml-auto text-xs text-white/25 shrink-0">{formatRelativeTime(entry.sentAt)}</span>
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
                <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap break-words">
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
                  <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap break-words">
                    {action.result}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {outputs.length === 0 && bodyOutcomes.length === 0 && entry.summary && (
        <p className="mt-2 pl-8 text-sm text-white/50">{entry.summary}</p>
      )}

      {footnoteOutcomes.length > 0 && (
        <div className="mt-2 pl-8 space-y-1">
          {footnoteOutcomes.map((action, idx) => {
            const isError = isErrorStatus(action.status)
            return (
              <div key={`${action.tool}-${idx}`} className="flex items-baseline gap-2 text-xs">
                <span className={`font-semibold shrink-0 ${isError ? "text-red-300" : "text-white/55"}`}>
                  {toolLabel(action.tool)}
                </span>
                {action.result && <span className="text-white/40 truncate">{action.result}</span>}
              </div>
            )
          })}
        </div>
      )}

      <FeedbackRow entry={entry} hasReply={hasReply} />
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="px-5 py-4 border-b border-white/[0.05] animate-pulse">
      <div className="flex items-center gap-2">
        <div className="size-6 rounded-lg bg-white/[0.07]" />
        <div className="h-3 w-28 rounded bg-white/[0.07]" />
        <div className="h-3 w-16 rounded bg-white/[0.05]" />
      </div>
      <div className="mt-3 pl-8">
        <div className="h-16 rounded-lg bg-white/[0.04]" />
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

function emptyStates(agentName: string): Record<Focus, { title: string; body: string }> {
  return {
    attention: {
      title: "Nothing needs your attention",
      body: "Escalations, failed actions, and flagged orders will land here.",
    },
    auto: {
      title: "Nothing auto-sent yet",
      body: `When ${agentName} replies or acts on its own, it shows up here for a quick spot-check.`,
    },
    all: {
      title: "Nothing to review yet",
      body: `Once ${agentName} starts handling tickets, every output appears here for you to spot-check.`,
    },
  }
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
      <div className="px-5 py-4 border-b border-white/[0.06]">
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
                    ? "bg-white/[0.12] text-white border-white/[0.18]"
                    : "bg-white/[0.04] text-white/55 border-white/[0.08] hover:bg-white/[0.08] hover:text-white/80"
                }`}
              >
                {opt.label}
              </button>
            )
          })}
          {fromParam === "24h" && (
            <span className="text-xs text-white/35 ml-1">· Last 24 hours</span>
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
          <p className="text-sm text-white/50">Failed to load agent outputs.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            Try again
          </button>
        </div>
      ) : allEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <div className="size-10 rounded-xl bg-white/[0.06] flex items-center justify-center mb-4">
            {focus === "attention" ? (
              <Eye className="size-5 text-white/30" />
            ) : (
              <MessageSquare className="size-5 text-white/30" />
            )}
          </div>
          <p className="text-sm font-medium text-white/60 mb-1">{emptyState.title}</p>
          <p className="text-xs text-white/30 max-w-xs">
            {fromLabel ? `No outputs match this lens${fromLabel}.` : emptyState.body}
          </p>
        </div>
      ) : (
        <>
          {dayGroups.map((group) => (
            <div key={group.key}>
              <div className="px-5 pt-4 pb-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/35">
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
                className="text-xs font-medium text-white/35 hover:text-white/60 disabled:opacity-40 transition-colors inline-flex items-center gap-1.5"
              >
                {isLoadingMore ? <Loader2 className="size-3 animate-spin" /> : null}
                {isLoadingMore ? "Loading…" : "Load more"}
              </button>
            ) : (
              <p className="text-xs text-white/20">All caught up</p>
            )}
          </div>
        </>
      )}
    </>
  )
}
