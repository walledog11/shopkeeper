import { TOOL_LABELS } from "@shopkeeper/agent/tools"
import type { useReports } from "@/hooks/useReports"
import type { DateRangePreset as Preset } from "@/lib/analytics/date-range"
import { getChannelLabel } from "@/lib/messaging/channels"

export type ReportsData = ReturnType<typeof useReports>["data"]

export const BADGE_LABELS: Record<Preset, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
  custom: "",
}

export const TAG_BAR_COLORS: Record<string, string> = {
  Shipping: "bg-blue-500/70",
  Returns: "bg-amber-500/70",
  "Order Status": "bg-emerald-500/70",
  "Product Inquiry": "bg-violet-500/70",
  General: "bg-slate-500/70",
}

export const TAG_BADGE_COLORS: Record<string, string> = {
  Shipping: "bg-blue-900/40 text-blue-400 border-blue-800/50",
  Returns: "bg-amber-900/40 text-amber-400 border-amber-800/50",
  "Order Status": "bg-emerald-900/40 text-emerald-400 border-emerald-800/50",
  "Product Inquiry": "bg-violet-900/40 text-violet-400 border-violet-800/50",
  General: "bg-slate-800/40 text-slate-400 border-slate-700/50",
}

export function formatMinutes(mins: number | null): string {
  if (mins === null) return ","
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function formatChannel(ch: string): string {
  return getChannelLabel(ch, { operatorLabel: "internal" })
}

export function formatTool(tool: string): string {
  return TOOL_LABELS[tool] ?? tool
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")
  ).join("\n")
  triggerDownload(new Blob([csv], { type: "text/csv" }), filename)
}
