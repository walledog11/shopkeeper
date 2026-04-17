"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import useSWR from "swr"
import { ArrowRight, Zap } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { getChannelInfo } from "@/lib/channels"
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
  const channel = getChannelInfo(entry.channelType as ChannelType)
  const isOperator = OPERATOR_CHANNELS.has(entry.channelType)
  const tagColor = entry.threadTag ? (TAG_COLORS[entry.threadTag] ?? TAG_COLORS["General"]) : null
  const visibleTools = entry.actions.map(a => a.tool).filter(t => (TOOL_CATEGORIES[t] ?? "internal") !== "read")
  const uniqueTools = [...new Set(visibleTools)]

  // Operator sessions: headline is the instruction; link to Concierge
  // Customer tickets: headline is the customer name; link to the specific thread
  const href = isOperator ? "/dashboard/agent" : `/dashboard/tickets?thread=${entry.threadId}`
  const headline = isOperator
    ? (entry.instruction ?? "Agent session")
    : entry.customerHandle

  const rowContent = (
    <>
      {/* Channel icon */}
      <div className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
        <Image src={channel.logo} alt={channel.name} width={14} height={14} className="object-contain" />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white/80 truncate">{headline}</span>
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
      </div>

      {/* Timestamp + arrow */}
      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        <span className="text-[11px] text-white/25">{formatRelative(entry.sentAt)}</span>
        <ArrowRight className="w-3 h-3 text-white/15 group-hover:text-white/40 transition-colors" />
      </div>
    </>
  )

  return (
    <Link
      href={href}
      className="flex items-start gap-3 px-5 py-4 border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors group"
    >
      {rowContent}
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface ApiResponse {
  entries: ActionLogEntry[]
  nextCursor: string | null
}

export default function ActivityFeed() {
  const { data, isLoading, error } = useSWR<ApiResponse>("/api/agent/actions", fetcher, {
    revalidateOnFocus: false,
  })

  const [pages, setPages] = useState<ActionLogEntry[][]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [noMore, setNoMore] = useState(false)

  // Merge SWR first page with subsequently loaded pages
  const firstPage = data?.entries ?? []
  const initialCursor = data?.nextCursor ?? null
  const allEntries = [...firstPage, ...pages.flat()]

  async function loadMore() {
    const nextCursor = pages.length === 0 ? initialCursor : cursor
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/agent/actions?cursor=${encodeURIComponent(nextCursor)}`)
      const json: ApiResponse = await res.json()
      setPages(prev => [...prev, json.entries])
      setCursor(json.nextCursor)
      if (!json.nextCursor) setNoMore(true)
    } finally {
      setLoadingMore(false)
    }
  }

  const hasMore = !noMore && (pages.length === 0 ? !!initialCursor : !!cursor)

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white">Activity</h1>
        <p className="text-sm text-white/40 mt-0.5">Every action taken by the AI agent, most recent first.</p>
      </div>

      {/* Content */}
      {isLoading ? (
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
          <p className="text-sm font-medium text-white/60 mb-1">No agent actions yet</p>
          <p className="text-xs text-white/30 max-w-xs">
            Once the AI agent starts handling tickets — sending replies, issuing refunds, updating orders — each action will appear here.
          </p>
        </div>
      ) : (
        <>
          {allEntries.map(entry => <EntryRow key={entry.id} entry={entry} />)}

          <div className="flex justify-center py-6">
            {hasMore ? (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs font-medium text-white/35 hover:text-white/60 disabled:opacity-40 transition-colors"
              >
                {loadingMore ? "Loading…" : "Load more"}
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
