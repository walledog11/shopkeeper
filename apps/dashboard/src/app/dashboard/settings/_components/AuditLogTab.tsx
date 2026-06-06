"use client"

import Link from "next/link"
import Image from "next/image"
import { useMemo, useState } from "react"
import { AlertCircle, Check, ChevronDown, Download, ExternalLink, Loader2, X, Zap } from "lucide-react"
import { TOOL_CATEGORIES, TOOL_LABELS } from "@clerk/agent/tools"
import { getChannelInfo, getChannelOptions } from "@/lib/messaging/channels"
import { isOperatorChannel } from "@clerk/agent/thread-constants"
import { buildActionLogSearchParams, useActionLogEntries, type ActionLogQueryFilters } from "@/hooks/useActionLogEntries"
import { formatDate, timeAgo } from "@/lib/format/date"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import type { ActionLogEntry, ToolCategory } from "@/types"

interface Filters {
  channels: string[]
  tools: string[]
  errorsOnly: boolean
  from: string
  to: string
}

const EMPTY_FILTERS: Filters = { channels: [], tools: [], errorsOnly: false, from: "", to: "" }

interface OptionGroup {
  label: string
  options: { id: string; label: string }[]
}

const CHANNEL_OPTIONS = getChannelOptions()

const CATEGORY_LABELS: Record<ToolCategory, string> = {
  action: "Actions",
  communication: "Communication",
  internal: "Internal",
  read: "Read",
}

const CHANNEL_GROUPS: OptionGroup[] = [{ label: "Channels", options: CHANNEL_OPTIONS }]

const TOOL_GROUPS: OptionGroup[] = (Object.keys(CATEGORY_LABELS) as ToolCategory[]).map((cat) => ({
  label: CATEGORY_LABELS[cat],
  options: Object.entries(TOOL_LABELS).flatMap(([id, label]) => (
    TOOL_CATEGORIES[id] === cat ? [{ id, label }] : []
  )),
}))

function toQueryFilters(filters: Filters): ActionLogQueryFilters {
  return {
    channels: filters.channels,
    tools: filters.tools,
    errorsOnly: filters.errorsOnly,
    from: filters.from ? new Date(filters.from).toISOString() : null,
    to: filters.to ? new Date(`${filters.to}T23:59:59.999Z`).toISOString() : null,
  }
}

function ActionPill({ tool, result }: { tool: string; result: string }) {
  const isError = result.startsWith("Error")
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
        isError
          ? "border-red-400/20 bg-red-400/10 text-red-300"
          : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
      }`}
      title={result}
    >
      {isError ? (
        <AlertCircle className="size-3 shrink-0" />
      ) : (
        <Check className="size-3 shrink-0" />
      )}
      {TOOL_LABELS[tool] ?? tool}
    </span>
  )
}

function AuditEntryRow({ entry }: { entry: ActionLogEntry }) {
  const channel = getChannelInfo(entry.channelType)
  const isOperator = isOperatorChannel(entry.channelType)
  const href = entry.threadId
    ? (isOperator
      ? `/dashboard/agent?session=${encodeURIComponent(entry.threadId)}`
      : `/dashboard/tickets?thread=${entry.threadId}`)
    : null
  const linkLabel = isOperator ? "View Concierge" : "View thread"
  const title = entry.customerHandle ?? entry.instruction ?? "Workspace action"

  return (
    <div className="rounded-md border border-white/[0.07] bg-white/[0.03] px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
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
                <span className="truncate text-sm font-semibold text-white/80">{title}</span>
                {entry.mode === "auto_executed" && (
                  <span
                    title="Auto-executed by the agent without merchant approval"
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-800/50 bg-emerald-900/40 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-300"
                  >
                    <Zap className="size-2.5" /> Auto
                  </span>
                )}
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-xs font-semibold text-white/35">
                  {channel.name}
                </span>
                {entry.threadTag && (
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-xs font-semibold text-white/35">
                    {entry.threadTag}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-white/25" title={formatDate(entry.sentAt)}>
                {timeAgo(entry.sentAt)} · {formatDate(entry.sentAt)}
              </p>
            </div>
            {href ? (
              <Link
                href={href}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-white/35 transition-colors hover:text-white/65"
              >
                {linkLabel}
                <ExternalLink className="size-3" />
              </Link>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-white/25">
                Workspace action
              </span>
            )}
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

function MultiSelectPopover({
  label,
  selected,
  onToggle,
  onClear,
  groups,
}: {
  label: string
  selected: string[]
  onToggle: (id: string) => void
  onClear: () => void
  groups: OptionGroup[]
}) {
  const count = selected.length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 h-8 text-xs font-semibold transition-colors ${
            count > 0
              ? "border-amber-400/30 bg-amber-400/[0.08] text-amber-200 hover:bg-amber-400/[0.12]"
              : "border-white/[0.10] bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white/80"
          }`}
        >
          {label}
          {count > 0 && (
            <span className="rounded-full bg-amber-400 text-black px-1.5 py-px text-xs font-bold">{count}</span>
          )}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5 max-h-80 overflow-y-auto">
        {count > 0 && (
          <div className="flex items-center justify-between border-b border-white/[0.07] px-2 py-1.5 mb-1">
            <span className="text-xs font-semibold text-white/40 uppercase tracking-wide">{count} selected</span>
            <button type="button" onClick={onClear} className="text-xs font-semibold text-white/50 hover:text-white/80">
              Clear
            </button>
          </div>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-1 last:mb-0">
            <div className="px-2 py-1 text-xs font-bold uppercase tracking-[0.05em] text-white/30">{group.label}</div>
            {group.options.map((opt) => {
              const active = selected.includes(opt.id)
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onToggle(opt.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs text-white/70 transition-colors hover:bg-white/[0.06]"
                >
                  <span className="truncate">{opt.label}</span>
                  {active && <Check className="size-3.5 shrink-0 text-amber-300" />}
                </button>
              )
            })}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}

export default function AuditLogTab() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const queryFilters = useMemo(() => toQueryFilters(filters), [filters])
  const {
    entries: allEntries,
    isLoading,
    error,
    hasMore,
    isLoadingMore,
    loadMore,
    refresh,
  } = useActionLogEntries(queryFilters)
  const [isExporting, setIsExporting] = useState(false)

  const hasActiveFilters: boolean =
    filters.channels.length > 0 ||
    filters.tools.length > 0 ||
    filters.errorsOnly ||
    filters.from !== "" ||
    filters.to !== ""

  const updateFilters = (updater: (filters: Filters) => Filters) => {
    setFilters(updater)
  }

  const toggleInList = (key: "channels" | "tools", id: string) =>
    updateFilters((f) => ({
      ...f,
      [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id],
    }))

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const params = buildActionLogSearchParams(queryFilters)
      params.set("format", "csv")
      const res = await fetch(`/api/agent/actions?${params}`)
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
        <button type="button"
          onClick={handleExport}
          disabled={isExporting || allEntries.length === 0}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-white/[0.07] px-3 py-1.5 text-xs font-semibold text-white/60 transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-40"
        >
          {isExporting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          Export CSV
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectPopover
          label="Channel"
          selected={filters.channels}
          onToggle={(id) => toggleInList("channels", id)}
          onClear={() => updateFilters((f) => ({ ...f, channels: [] }))}
          groups={CHANNEL_GROUPS}
        />
        <MultiSelectPopover
          label="Tool"
          selected={filters.tools}
          onToggle={(id) => toggleInList("tools", id)}
          onClear={() => updateFilters((f) => ({ ...f, tools: [] }))}
          groups={TOOL_GROUPS}
        />
        <button
          type="button"
          onClick={() => updateFilters((f) => ({ ...f, errorsOnly: !f.errorsOnly }))}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 h-8 text-xs font-semibold transition-colors ${
            filters.errorsOnly
              ? "border-red-400/30 bg-red-400/10 text-red-300 hover:bg-red-400/15"
              : "border-white/[0.10] bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white/80"
          }`}
        >
          <AlertCircle className="size-3" />
          Errors only
        </button>
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => updateFilters((f) => ({ ...f, from: e.target.value }))}
            className="h-8 w-36 text-xs bg-white/[0.04] border-white/[0.10] text-white/70"
          />
          <span className="text-xs text-white/30">→</span>
          <Input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => updateFilters((f) => ({ ...f, to: e.target.value }))}
            className="h-8 w-36 text-xs bg-white/[0.04] border-white/[0.10] text-white/70"
          />
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => updateFilters(() => EMPTY_FILTERS)}
            className="inline-flex items-center gap-1 px-2 h-8 text-xs font-semibold text-white/45 hover:text-white/80 transition-colors"
          >
            <X className="size-3" />
            Clear filters
          </button>
        )}
      </div>

      {isLoading && allEntries.length === 0 ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 8 }, (_, index) => `audit-skeleton-${index}`).map((key) => (
            <div key={key} className="h-24 rounded-md border border-white/[0.06] bg-white/[0.04]" />
          ))}
        </div>
      ) : error && allEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm font-semibold text-white/40">Failed to load audit log</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-3 text-xs font-semibold text-white/35 transition-colors hover:text-white/65"
          >
            Try again
          </button>
        </div>
      ) : allEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm font-semibold text-white/40">
            {hasActiveFilters ? "No actions match these filters" : "No structured agent actions yet"}
          </p>
          <p className="mt-1 text-xs text-white/25">
            {hasActiveFilters
              ? "Try clearing a filter or widening the date range."
              : "Executed replies, refunds, order updates, and other agent actions will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {allEntries.map((entry) => (
            <AuditEntryRow key={entry.id} entry={entry} />
          ))}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="text-xs font-semibold text-white/40 transition-colors hover:text-white/70 disabled:opacity-40"
              >
                {isLoadingMore ? <Loader2 className="size-3.5 animate-spin" /> : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
