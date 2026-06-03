"use client"

import { CheckCircle2, Clock, FileText, MessageSquare } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExportButton } from "./ExportButton"
import { Skeleton } from "./Skeleton"
import { downloadCSV, formatChannel, formatMinutes, type ReportsData } from "./reports-helpers"

export function SupportSummaryCard({
  data,
  isLoading,
  rangeLabel,
}: {
  data: ReportsData
  isLoading: boolean
  rangeLabel: string
}) {
  const support = data?.support
  const maxChannel = Math.max(...(support?.byChannel.map(c => c.count) ?? [1]), 1)

  function handleExport() {
    if (!support) return
    downloadCSV(`support-summary-${rangeLabel.replace(/\s/g, "-")}.csv`, [
      ["Period", "Total Tickets", "Closed", "Open/Pending", "Resolution Rate (%)", "Avg First Reply (min)"],
      [rangeLabel, support.total, support.closed, support.openAndPending, support.resolutionRate, support.avgFirstReplyMinutes ?? "N/A"],
      [],
      ["Channel", "Tickets"],
      ...support.byChannel.map(c => [formatChannel(c.channel), c.count]),
      [],
      ["Topic", "Tickets"],
      ...support.byTag.map(t => [t.tag, t.count]),
    ])
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="size-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm">Support Summary</CardTitle>
          </div>
          <ExportButton onClick={handleExport} disabled={isLoading || !support} />
        </div>
      </CardHeader>

      <CardContent className="pt-5 flex-1 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Tickets", value: support?.total, icon: <MessageSquare className="size-4 text-white/40" /> },
            { label: "Resolved", value: support?.closed, icon: <CheckCircle2 className="size-4 text-emerald-500/70" /> },
            { label: "Resolution Rate", value: support ? `${support.resolutionRate}%` : undefined, icon: <CheckCircle2 className="size-4 text-primary/70" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                {icon}
              </div>
              {isLoading
                ? <Skeleton className="h-7 w-12" />
                : <p className="text-2xl font-extrabold text-foreground leading-none">{value?.toLocaleString() ?? ","}</p>
              }
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">Avg first reply</span>
          </div>
          {isLoading
            ? <Skeleton className="h-5 w-12" />
            : <span className="text-sm font-bold text-foreground">{formatMinutes(support?.avgFirstReplyMinutes ?? null)}</span>
          }
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">By channel</p>
          {isLoading ? (
            <div className="space-y-2">
              {["summary-skeleton-1", "summary-skeleton-2", "summary-skeleton-3"].map((key) => <Skeleton key={key} className="h-5 w-full" />)}
            </div>
          ) : support?.byChannel.length ? (
            <div className="space-y-2">
              {support.byChannel.map(c => (
                <div key={c.channel} className="flex items-center gap-2.5">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{formatChannel(c.channel)}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all duration-500"
                      style={{ width: `${Math.round((c.count / maxChannel) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-foreground w-6 text-right shrink-0">{c.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No ticket data</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
