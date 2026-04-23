"use client"

import Link from "next/link"
import Image from "next/image"
import { useState } from "react"
import { AlertCircle, Check, Download, ExternalLink, Loader2 } from "lucide-react"
import useSWRInfinite from "swr/infinite"
import { TOOL_LABELS } from "@/lib/agent/tools"
import { getChannelInfo } from "@/lib/messaging/channels"
import { fetcher } from "@/lib/api/fetcher"
import { formatDate, timeAgo } from "@/lib/format/date"
import type { ActionLogEntry, ChannelType } from "@/types"

interface Page {
  entries: ActionLogEntry[]
  nextCursor: string | null
}

const OPERATOR_CHANNELS = new Set(["dashboard_agent", "sms_agent"])

function getKey(_pageIndex: number, previousPage: Page | null): string | null {
  if (previousPage && !previousPage.nextCursor) return null
  const cursor = previousPage?.nextCursor
  return cursor
    ? `/api/agent/actions?cursor=${encodeURIComponent(cursor)}`
    : "/api/agent/actions"
}

function ActionPill({ tool, result }: { tool: string; result: string }) {
  const isError = result.startsWith("Error")
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        isError
          ? "border-red-400/20 bg-red-400/10 text-red-300"
          : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
      }`}
      title={result}
    >
      {isError ? (
        <AlertCircle className="h-3 w-3 shrink-0" />
      ) : (
        <Check className="h-3 w-3 shrink-0" />
      )}
      {TOOL_LABELS[tool] ?? tool}
    </span>
  )
}

function AuditEntryRow({ entry }: { entry: ActionLogEntry }) {
  const channel = getChannelInfo(entry.channelType as ChannelType)
  const isOperator = OPERATOR_CHANNELS.has(entry.channelType)
  const href = isOperator ? "/dashboard/agent" : `/dashboard/tickets?thread=${entry.threadId}`
  const linkLabel = isOperator ? "View Concierge" : "View thread"

  return (
    <div className="rounded-md border border-white/[0.07] bg-white/[0.03] px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
          <Image
            src={channel.logo}
            alt={channel.name}
            width={14}
            height={14}
            className="object-contain opacity-70"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="truncate text-sm font-semibold text-white/80">{entry.customerHandle}</span>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-white/35">
                  {channel.name}
                </span>
                {entry.threadTag && (
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold text-white/35">
                    {entry.threadTag}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-white/25" title={formatDate(entry.sentAt)}>
                {timeAgo(entry.sentAt)} · {formatDate(entry.sentAt)}
              </p>
            </div>
            <Link
              href={href}
              className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-white/35 transition-colors hover:text-white/65"
            >
              {linkLabel}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {entry.instruction && (
            <p className="mt-2 truncate text-xs italic text-white/35">&ldquo;{entry.instruction}&rdquo;</p>
          )}

          <p className="mt-1.5 text-sm leading-relaxed text-white/50">{entry.summary}</p>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {entry.actions.map((action, index) => (
              <ActionPill key={`${entry.id}-${action.tool}-${index}`} tool={action.tool} result={action.result} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AuditLogTab() {
  const { data, isLoading, size, setSize } = useSWRInfinite<Page>(getKey, fetcher)
  const [isExporting, setIsExporting] = useState(false)

  const allEntries = data?.flatMap((page) => page.entries) ?? []
  const hasMore = data ? !!data[data.length - 1]?.nextCursor : false

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const res = await fetch("/api/agent/actions?format=csv")
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-white/80">Audit Log</h1>
          <p className="mt-0.5 text-sm text-white/35">
            Structured agent actions across your workspace. Human notes stay in thread history.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting || allEntries.length === 0}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-white/[0.07] px-3 py-1.5 text-xs font-semibold text-white/60 transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-40"
        >
          {isExporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Export CSV
        </button>
      </div>

      {isLoading && allEntries.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-24 rounded-md border border-white/[0.06] bg-white/[0.04]" />
          ))}
        </div>
      ) : allEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm font-semibold text-white/40">No structured agent actions yet</p>
          <p className="mt-1 text-xs text-white/25">
            Executed replies, refunds, order updates, and other agent actions will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {allEntries.map((entry) => (
            <AuditEntryRow key={entry.id} entry={entry} />
          ))}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setSize(size + 1)}
                disabled={isLoading}
                className="text-xs font-semibold text-white/40 transition-colors hover:text-white/70 disabled:opacity-40"
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
