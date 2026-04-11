"use client"

import { useState } from "react"
import Image from "next/image"
import { Download, Loader2 } from "lucide-react"
import useSWRInfinite from "swr/infinite"
import { getChannelInfo } from "@/lib/channels"
import { formatDate } from "@/lib/utils"
import { fetcher } from "@/lib/fetcher"
import type { ChannelType, SenderType } from "@/types"

interface AuditEntry {
  id: string
  senderType: SenderType
  contentText: string | null
  sentAt: string
  thread: {
    id: string
    channelType: ChannelType
    customer: { name: string | null; platformId: string } | null
  }
}

interface Page {
  entries: AuditEntry[]
  nextCursor: string | null
}

function getKey(pageIndex: number, previousPage: Page | null): string | null {
  if (previousPage && !previousPage.nextCursor) return null
  const cursor = previousPage?.nextCursor
  return cursor
    ? `/api/org/audit-log?cursor=${encodeURIComponent(cursor)}`
    : '/api/org/audit-log'
}

export default function AuditLogTab() {
  const { data, isLoading, size, setSize } = useSWRInfinite<Page>(getKey, fetcher)
  const [isExporting, setIsExporting] = useState(false)

  const allEntries = data?.flatMap(p => p.entries) ?? []
  const hasMore = data ? !!data[data.length - 1]?.nextCursor : false

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const res = await fetch('/api/org/audit-log?format=csv')
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
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
          <p className="text-sm text-white/35 mt-0.5">All AI and agent actions across your workspace.</p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting || allEntries.length === 0}
          className="flex items-center gap-1.5 shrink-0 text-xs font-semibold text-white/60 hover:text-white bg-white/[0.07] hover:bg-white/[0.12] border border-border rounded-md px-3 py-1.5 transition-colors disabled:opacity-40"
        >
          {isExporting
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Download className="w-3.5 h-3.5" />}
          Export CSV
        </button>
      </div>

      {isLoading && allEntries.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-md bg-white/[0.04] border border-white/[0.06]" />
          ))}
        </div>
      ) : allEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm font-semibold text-white/40">No audit entries yet</p>
          <p className="text-xs text-white/25 mt-1">AI actions and internal notes will appear here.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {allEntries.map(entry => {
            const ch = getChannelInfo(entry.thread.channelType)
            const customer =
              entry.thread.customer?.name ??
              entry.thread.customer?.platformId ??
              'Unknown'
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 rounded-md border border-white/[0.07] bg-white/[0.03] px-3 py-2.5"
              >
                <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                  <Image
                    src={ch.logo}
                    alt={ch.name}
                    width={12}
                    height={12}
                    className="object-contain opacity-40 brightness-0 invert"
                  />
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${
                    entry.senderType === 'ai'
                      ? 'text-violet-400 bg-violet-400/10 border-violet-400/20'
                      : 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                  }`}>
                    {entry.senderType === 'ai' ? 'AI' : 'Note'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-white/60 truncate">{customer}</span>
                    <span className="text-[10px] text-white/25 shrink-0">{formatDate(entry.sentAt)}</span>
                  </div>
                  <p className="text-xs text-white/40 leading-relaxed line-clamp-3">
                    {entry.contentText ?? <span className="italic">No content</span>}
                  </p>
                </div>
              </div>
            )
          })}

          {hasMore && (
            <div className="pt-2 flex justify-center">
              <button
                onClick={() => setSize(size + 1)}
                disabled={isLoading}
                className="text-xs font-semibold text-white/40 hover:text-white/70 transition-colors disabled:opacity-40"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
