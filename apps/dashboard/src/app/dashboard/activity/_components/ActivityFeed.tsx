"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import useSWRInfinite from "swr/infinite"
import { ArrowRight, ChevronDown, ChevronRight, Eye, Loader2, ShieldCheck, X, Zap } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"
import { redactPii } from "@/lib/format/redact"
import { getChannelInfo } from "@/lib/messaging/channels"
import type { ActionLogEntry, ChannelType } from "@/types"

// ── Tool metadata ──────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  send_reply:                    "Send reply",
  send_email:                    "Send email",
  get_shopify_orders:            "Fetch orders",
  get_shopify_customer:          "Fetch customer",
  search_shopify_customers:      "Search customers",
  search_shopify_products:       "Search products",
  get_order_by_name:             "Look up order",
  search_kb:                     "Search KB",
  create_refund:                 "Issue refund",
  cancel_order:                  "Cancel order",
  edit_shopify_order:            "Edit order",
  create_shopify_order:          "Create order",
  update_shopify_order_address:  "Update address",
  update_shopify_customer_info:  "Update customer",
  add_shopify_customer_note:     "Add Shopify note",
  add_internal_note:             "Add note",
  update_thread_status:          "Update status",
  update_thread_tag:             "Update tag",
}

type ToolCategory = "action" | "communication" | "internal" | "read"

const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  send_reply:                   "communication",
  send_email:                   "communication",
  create_refund:                "action",
  cancel_order:                 "action",
  edit_shopify_order:           "action",
  create_shopify_order:         "action",
  update_shopify_order_address: "action",
  update_shopify_customer_info: "action",
  add_shopify_customer_note:    "action",
  add_internal_note:            "internal",
  update_thread_status:         "internal",
  update_thread_tag:            "internal",
  get_shopify_orders:           "read",
  get_shopify_customer:         "read",
  search_shopify_customers:     "read",
  search_shopify_products:      "read",
  get_order_by_name:            "read",
  search_kb:                    "read",
}

const PILL_STYLES: Record<ToolCategory, string> = {
  action:        "bg-amber-900/40 text-amber-400 border-amber-800/50",
  communication: "bg-emerald-900/40 text-emerald-400 border-emerald-800/50",
  internal:      "bg-blue-900/40 text-blue-400 border-blue-800/50",
  read:          "bg-white/[0.05] text-white/30 border-white/[0.08]",
}

const TAG_COLORS: Record<string, string> = {
  Shipping:          "bg-blue-900/40 text-blue-400 border-blue-800/50",
  Returns:           "bg-amber-900/40 text-amber-400 border-amber-800/50",
  "Order Status":    "bg-emerald-900/40 text-emerald-400 border-emerald-800/50",
  "Product Inquiry": "bg-violet-900/40 text-violet-400 border-violet-800/50",
  General:           "bg-slate-800/40 text-slate-400 border-slate-700/50",
}

// ── Mode metadata ──────────────────────────────────────────────────────────────

type Mode = NonNullable<ActionLogEntry["mode"]>

const MODE_OPTIONS: { id: Mode; label: string; shortLabel: string; icon: typeof Zap; pill: string }[] = [
  {
    id: "auto_executed",
    label: "Auto-executed",
    shortLabel: "Auto",
    icon: Zap,
    pill: "bg-emerald-900/40 text-emerald-300 border-emerald-800/50",
  },
  {
    id: "human_approved",
    label: "Human approved",
    shortLabel: "Approved",
    icon: ShieldCheck,
    pill: "bg-violet-900/40 text-violet-300 border-violet-800/50",
  },
  {
    id: "read_only",
    label: "Read only",
    shortLabel: "Read",
    icon: Eye,
    pill: "bg-white/[0.05] text-white/45 border-white/[0.08]",
  },
]

const MODE_META: Record<Mode, (typeof MODE_OPTIONS)[number]> = Object.fromEntries(
  MODE_OPTIONS.map((m) => [m.id, m]),
) as Record<Mode, (typeof MODE_OPTIONS)[number]>

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1)  return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return "yesterday"
  if (days < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatDuration(ms: number): string {
  if (ms < 1) return "0ms"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}

function totalDurationMs(entry: ActionLogEntry): number {
  return entry.actions.reduce((sum, a) => sum + (a.durationMs ?? 0), 0)
}

function approverLabel(entry: ActionLogEntry): string {
  if (!entry.approver) return "—"
  return entry.approver.displayName ?? entry.approver.id
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ToolPill({ tool }: { tool: string }) {
  const category = TOOL_CATEGORIES[tool] ?? "internal"
  if (category === "read") return null
  const label = TOOL_LABELS[tool] ?? tool
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${PILL_STYLES[category]}`}>
      {label}
    </span>
  )
}

function ModeChip({ mode, compact }: { mode: Mode; compact?: boolean }) {
  const meta = MODE_META[mode]
  const Icon = meta.icon
  return (
    <span
      title={meta.label}
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${meta.pill}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {compact ? meta.shortLabel : meta.label}
    </span>
  )
}

function InputViewer({ input }: { input: unknown }) {
  // Lazy render: parent only mounts this when expanded, so the redaction +
  // JSON.stringify cost is paid per click rather than per row.
  const redacted = useMemo(() => redactPii(input), [input])
  const text = useMemo(() => JSON.stringify(redacted, null, 2), [redacted])
  return (
    <pre className="mt-1 text-[11px] leading-relaxed text-white/55 bg-black/30 border border-white/[0.06] rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
      {text}
    </pre>
  )
}

function ActionDetailRow({ action }: { action: ActionLogEntry["actions"][number] }) {
  const [open, setOpen] = useState(false)
  const Chevron = open ? ChevronDown : ChevronRight
  const label = TOOL_LABELS[action.tool] ?? action.tool
  const hasInput = action.input != null && (typeof action.input !== "object" || Object.keys(action.input as object).length > 0)
  const isError = action.status === "error" || action.status === "policy_block"

  return (
    <div className="border-t border-white/[0.04] py-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!hasInput}
        className="flex w-full items-center gap-2 text-left text-[11px] disabled:cursor-default"
      >
        <Chevron className={`w-3 h-3 shrink-0 ${hasInput ? "text-white/40" : "text-transparent"}`} />
        <span className={`font-semibold ${isError ? "text-red-300" : "text-white/65"}`}>{label}</span>
        {action.status && action.status !== "success" && (
          <span className="text-[10px] uppercase tracking-wide text-white/35">{action.status.replace("_", " ")}</span>
        )}
        <span className="ml-auto text-[11px] text-white/30 tabular-nums">{formatDuration(action.durationMs ?? 0)}</span>
      </button>
      {open && hasInput && <InputViewer input={action.input} />}
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-start gap-3 px-5 py-4 border-b border-white/[0.05] animate-pulse">
      <div className="w-7 h-7 rounded-lg bg-white/[0.07] shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-3 w-28 rounded bg-white/[0.07]" />
          <div className="h-3 w-16 rounded bg-white/[0.05]" />
        </div>
        <div className="h-3 w-3/4 rounded bg-white/[0.05]" />
        <div className="flex gap-1.5">
          <div className="h-4 w-16 rounded bg-white/[0.05]" />
          <div className="h-4 w-20 rounded bg-white/[0.05]" />
        </div>
      </div>
      <div className="h-3 w-10 rounded bg-white/[0.05] shrink-0 mt-1" />
    </div>
  )
}

const OPERATOR_CHANNELS = new Set(["dashboard_agent", "sms_agent"])

function EntryRow({ entry }: { entry: ActionLogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const channel = getChannelInfo(entry.channelType as ChannelType)
  const isOperator = OPERATOR_CHANNELS.has(entry.channelType)
  const tagColor = entry.threadTag ? (TAG_COLORS[entry.threadTag] ?? TAG_COLORS["General"]) : null
  const visibleTools = entry.actions.map(a => a.tool).filter(t => (TOOL_CATEGORIES[t] ?? "internal") !== "read")
  const uniqueTools = [...new Set(visibleTools)]

  const href = isOperator ? "/dashboard/agent" : `/dashboard/tickets?thread=${entry.threadId}`
  const headline = isOperator
    ? (entry.instruction ?? "Agent session")
    : entry.customerHandle

  const totalMs = totalDurationMs(entry)

  return (
    <div className="border-b border-white/[0.05]">
      <div className="flex items-start gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors group">
        {/* Channel icon */}
        <div className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
          <Image src={channel.logo} alt={channel.name} width={14} height={14} className="object-contain" />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={href} className="text-sm font-semibold text-white/80 truncate hover:text-white">
              {headline}
            </Link>
            {entry.mode && <ModeChip mode={entry.mode} compact />}
            {isOperator ? (
              <span className="text-[10px] font-semibold text-white/30 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded">
                {entry.channelType === "sms_agent" ? "SMS" : "Concierge"}
              </span>
            ) : tagColor && entry.threadTag ? (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tagColor}`}>
                {entry.threadTag}
              </span>
            ) : null}
          </div>

          {entry.summary && (
            <p className="text-xs text-white/45 leading-relaxed line-clamp-2">{entry.summary}</p>
          )}

          {uniqueTools.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap pt-0.5">
              {uniqueTools.map(tool => <ToolPill key={tool} tool={tool} />)}
            </div>
          )}

          {/* Metadata row: approver · duration · expander */}
          <div className="flex items-center gap-3 pt-1 text-[11px] text-white/35">
            <span title="Approver">
              <span className="text-white/25">By </span>
              <span className="font-medium text-white/55">{approverLabel(entry)}</span>
            </span>
            <span className="text-white/15">·</span>
            <span title="Total tool runtime" className="tabular-nums">{formatDuration(totalMs)}</span>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ml-auto inline-flex items-center gap-1 text-white/40 hover:text-white/70 transition-colors"
            >
              {expanded ? "Hide details" : "Show details"}
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Timestamp + arrow */}
        <Link href={href} className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <span className="text-[11px] text-white/25">{formatRelative(entry.sentAt)}</span>
          <ArrowRight className="w-3 h-3 text-white/15 group-hover:text-white/40 transition-colors" />
        </Link>
      </div>

      {expanded && (
        <div className="px-5 pb-4 pl-[3.75rem] -mt-1">
          {entry.actions.map((action, idx) => (
            <ActionDetailRow key={`${entry.id}-${action.tool}-${idx}`} action={action} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface ApiResponse {
  entries: ActionLogEntry[]
  nextCursor: string | null
}

function buildKey(modes: Mode[]) {
  return (_pageIndex: number, previousPage: ApiResponse | null): string | null => {
    if (previousPage && !previousPage.nextCursor) return null
    const params = new URLSearchParams()
    if (modes.length) params.set("mode", modes.join(","))
    if (previousPage?.nextCursor) params.set("cursor", previousPage.nextCursor)
    const qs = params.toString()
    return qs ? `/api/agent/actions?${qs}` : "/api/agent/actions"
  }
}

export default function ActivityFeed() {
  const [modes, setModes] = useState<Mode[]>([])
  const getKey = useMemo(() => buildKey(modes), [modes])
  const { data, isLoading, error, size, setSize, isValidating } = useSWRInfinite<ApiResponse>(getKey, fetcher, {
    revalidateOnFocus: false,
  })

  useEffect(() => {
    setSize(1)
  }, [modes, setSize])

  const allEntries = data?.flatMap((page) => page.entries) ?? []
  const hasMore = data ? !!data[data.length - 1]?.nextCursor : false

  const toggleMode = (id: Mode) =>
    setModes((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white">Activity</h1>
        <p className="text-sm text-white/40 mt-0.5">Every action taken by the AI agent, most recent first.</p>

        {/* Mode filter chip row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <span className="text-[11px] font-semibold text-white/30 uppercase tracking-wide mr-1">Mode</span>
          {MODE_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const active = modes.includes(opt.id)
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggleMode(opt.id)}
                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 h-6 rounded border transition-colors ${
                  active
                    ? opt.pill
                    : "bg-white/[0.04] text-white/55 border-white/[0.08] hover:bg-white/[0.08] hover:text-white/80"
                }`}
              >
                <Icon className="w-3 h-3" />
                {opt.label}
              </button>
            )
          })}
          {modes.length > 0 && (
            <button
              type="button"
              onClick={() => setModes([])}
              className="inline-flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70 transition-colors ml-1"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading && allEntries.length === 0 ? (
        <div>
          {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <p className="text-sm text-white/50">Failed to load activity log.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            Try again
          </button>
        </div>
      ) : allEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center mb-4">
            <Zap className="w-5 h-5 text-white/30" />
          </div>
          <p className="text-sm font-medium text-white/60 mb-1">
            {modes.length > 0 ? "No actions match this filter" : "No agent actions yet"}
          </p>
          <p className="text-xs text-white/30 max-w-xs">
            {modes.length > 0
              ? "Try clearing the mode filter or changing the selection."
              : "Once the AI agent starts handling tickets — sending replies, issuing refunds, updating orders — each action will appear here."}
          </p>
        </div>
      ) : (
        <>
          {allEntries.map(entry => <EntryRow key={entry.id} entry={entry} />)}

          <div className="flex justify-center py-6">
            {hasMore ? (
              <button
                onClick={() => setSize(size + 1)}
                disabled={isValidating}
                className="text-xs font-medium text-white/35 hover:text-white/60 disabled:opacity-40 transition-colors inline-flex items-center gap-1.5"
              >
                {isValidating ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
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
