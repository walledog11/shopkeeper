"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import useSWRInfinite from "swr/infinite"
import { ArrowRight, Eye, Loader2, MessageSquare } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"
import { getChannelInfo } from "@/lib/messaging/channels"
import { TOOL_CATEGORIES, TOOL_LABELS } from "@/lib/agent/tools"
import type { ActionLogEntry, ChannelType } from "@/types"

// ── Focus lenses ─────────────────────────────────────────────────────────────
// Each lens maps to the action-log API's `tool` filter so the sample is built
// server-side. "All" passes no filter.

type Focus = "replies" | "escalations" | "all"

const FOCUS_OPTIONS: { id: Focus; label: string; tools: string[] }[] = [
  { id: "replies", label: "Replies", tools: ["send_reply", "send_email"] },
  { id: "escalations", label: "Escalations", tools: ["escalate_to_human"] },
  { id: "all", label: "All outputs", tools: [] },
]

// ── Output extraction ────────────────────────────────────────────────────────
// The prose the agent actually produced lives in the tool input, not the result
// string ("Reply sent to customer..."). Pull it out so it can be read directly.

type Tone = "reply" | "note" | "escalate"

interface OutputBlock {
  key: string
  tool: string
  label: string
  text: string
  tone: Tone
}

const TONE_STYLES: Record<Tone, { container: string; label: string }> = {
  reply:    { container: "border-emerald-800/40 bg-emerald-900/[0.12]", label: "text-emerald-300" },
  escalate: { container: "border-amber-800/40 bg-amber-900/[0.12]",     label: "text-amber-300" },
  note:     { container: "border-white/[0.08] bg-white/[0.03]",          label: "text-white/45" },
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
      return reason ? { key, tool: action.tool, label: "Escalated to merchant", text: reason, tone: "escalate" } : null
    }
    case "add_internal_note": {
      const text = field(action.input, "text")
      return text ? { key, tool: action.tool, label: "Internal note", text, tone: "note" } : null
    }
    default:
      return null
  }
}

// Side-effecting actions (refunds, cancellations, edits) have no prose — their
// outcome is the result string. Surface them compactly under the prose.
function outcomeActions(entry: ActionLogEntry): ActionLogEntry["actions"] {
  return entry.actions.filter((action) => {
    if ((TOOL_CATEGORIES[action.tool] ?? "internal") === "read") return false
    return action.tool !== "send_reply"
      && action.tool !== "send_email"
      && action.tool !== "escalate_to_human"
      && action.tool !== "add_internal_note"
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return "yesterday"
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const MODE_LABELS: Record<NonNullable<ActionLogEntry["mode"]>, string> = {
  auto_executed: "Auto-sent",
  human_approved: "Approved",
  read_only: "Read only",
}

const OPERATOR_CHANNELS = new Set(["dashboard_agent", "sms_agent"])

// ── Sub-components ───────────────────────────────────────────────────────────

function ReviewCard({ entry }: { entry: ActionLogEntry }) {
  const channel = getChannelInfo(entry.channelType as ChannelType)
  const isOperator = OPERATOR_CHANNELS.has(entry.channelType)
  const href = isOperator ? "/dashboard/agent" : `/dashboard/tickets?thread=${entry.threadId}`
  const headline = isOperator ? (entry.instruction ?? "Agent session") : entry.customerHandle

  const outputs = entry.actions.map(toOutputBlock).filter((b): b is OutputBlock => b !== null)
  const outcomes = outcomeActions(entry)

  return (
    <div className="border-b border-white/[0.05] px-5 py-4 hover:bg-white/[0.02] transition-colors group">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="size-6 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
          <Image src={channel.logo} alt={channel.name} width={13} height={13} className="object-contain" />
        </div>
        <Link href={href} className="text-sm font-semibold text-white/80 truncate hover:text-white">
          {headline}
        </Link>
        {entry.mode && (
          <span className="text-xs font-bold uppercase tracking-wide text-white/40 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded">
            {MODE_LABELS[entry.mode]}
          </span>
        )}
        {entry.threadTag && (
          <span className="text-xs font-medium text-white/40 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded">
            {entry.threadTag}
          </span>
        )}
        <Link href={href} className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-white/25">{formatRelative(entry.sentAt)}</span>
          <ArrowRight className="size-3 text-white/15 group-hover:text-white/40 transition-colors" />
        </Link>
      </div>

      {/* Prose outputs , what the agent actually said */}
      {outputs.length > 0 ? (
        <div className="mt-3 space-y-2 pl-8">
          {outputs.map((block) => {
            const tone = TONE_STYLES[block.tone]
            return (
              <div key={block.key} className={`rounded-lg border p-3 ${tone.container}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${tone.label}`}>{block.label}</p>
                <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap break-words">{block.text}</p>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-2 pl-8 text-xs text-white/30 italic">No customer-facing text in this turn.</p>
      )}

      {/* Outcomes , side-effecting actions with no prose */}
      {outcomes.length > 0 && (
        <div className="mt-2 pl-8 space-y-1">
          {outcomes.map((action, idx) => {
            const isError = action.status === "error" || action.status === "policy_block"
            return (
              <div key={`${action.tool}-${idx}`} className="flex items-baseline gap-2 text-xs">
                <span className={`font-semibold shrink-0 ${isError ? "text-red-300" : "text-white/55"}`}>
                  {TOOL_LABELS[action.tool] ?? action.tool}
                </span>
                {action.result && (
                  <span className="text-white/40 truncate">{action.result}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
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

// ── Page ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  entries: ActionLogEntry[]
  nextCursor: string | null
}

function buildKey(tools: string[]) {
  return (_pageIndex: number, previousPage: ApiResponse | null): string | null => {
    if (previousPage && !previousPage.nextCursor) return null
    const params = new URLSearchParams()
    if (tools.length) params.set("tool", tools.join(","))
    if (previousPage?.nextCursor) params.set("cursor", previousPage.nextCursor)
    const qs = params.toString()
    return qs ? `/api/agent/actions?${qs}` : "/api/agent/actions"
  }
}

export default function ReviewFeed() {
  const [focus, setFocus] = useState<Focus>("replies")
  const tools = useMemo(() => FOCUS_OPTIONS.find((o) => o.id === focus)?.tools ?? [], [focus])
  const getKey = useMemo(() => buildKey(tools), [tools])
  const { data, isLoading, error, setSize, isValidating } = useSWRInfinite<ApiResponse>(getKey, fetcher, {
    revalidateOnFocus: false,
  })

  const allEntries = data?.flatMap((page) => page.entries) ?? []
  const hasMore = data ? !!data[data.length - 1]?.nextCursor : false

  const changeFocus = (id: Focus) => {
    void setSize(1)
    setFocus(id)
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="p-5 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white">Review</h1>
        <p className="text-sm text-white/40 mt-0.5">Read what the AI actually drafted and sent. Spot-check quality.</p>

        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {FOCUS_OPTIONS.map((opt) => {
            const active = opt.id === focus
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => changeFocus(opt.id)}
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
        </div>
      </div>

      {/* Content */}
      {isLoading && allEntries.length === 0 ? (
        <div>
          {Array.from({ length: 6 }, (_, i) => `review-skeleton-${i}`).map((key) => <SkeletonCard key={key} />)}
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
            {focus === "escalations" ? <Eye className="size-5 text-white/30" /> : <MessageSquare className="size-5 text-white/30" />}
          </div>
          <p className="text-sm font-medium text-white/60 mb-1">Nothing to review yet</p>
          <p className="text-xs text-white/30 max-w-xs">
            {focus === "all"
              ? "Once the AI starts handling tickets, every output it produces will appear here for you to spot-check."
              : "No outputs match this lens. Try another focus above."}
          </p>
        </div>
      ) : (
        <>
          {allEntries.map((entry) => <ReviewCard key={entry.id} entry={entry} />)}

          <div className="flex justify-center py-6">
            {hasMore ? (
              <button
                type="button"
                onClick={() => setSize((current) => current + 1)}
                disabled={isValidating}
                className="text-xs font-medium text-white/35 hover:text-white/60 disabled:opacity-40 transition-colors inline-flex items-center gap-1.5"
              >
                {isValidating ? <Loader2 className="size-3 animate-spin" /> : null}
                {isValidating ? "Loading…" : "Load more"}
              </button>
            ) : (
              <p className="text-xs text-white/20">All caught up</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
