"use client"

import { Bot, MapPin, MessageSquare, Package, RotateCcw, ShoppingCart } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExportButton } from "./ExportButton"
import { Skeleton } from "./Skeleton"
import { downloadCSV, formatTool, type ReportsData } from "./reports-helpers"

export function AgentActivityCard({
  data,
  isLoading,
  rangeLabel,
}: {
  data: ReportsData
  isLoading: boolean
  rangeLabel: string
}) {
  const agent = data?.agent
  const maxTool = Math.max(...(agent?.topTools.map(t => t.count) ?? [1]), 1)

  function handleExport() {
    if (!agent) return
    downloadCSV(`agent-activity-${rangeLabel.replace(/\s/g, "-")}.csv`, [
      ["Metric", "Count"],
      ["Agent runs", agent.totalRuns],
      ["Replies sent", agent.repliesSent],
      ["Refunds issued", agent.refundsIssued],
      ["Orders cancelled", agent.cancellations],
      ["Orders edited", agent.orderEdits],
      ["Orders created", agent.ordersCreated],
      ["Address updates", agent.addressUpdates],
      [],
      ["Tool", "Calls"],
      ...agent.topTools.map(t => [formatTool(t.tool), t.count]),
    ])
  }

  const actionItems = [
    { label: "Refunds issued", value: agent?.refundsIssued, icon: <RotateCcw className="size-4 text-amber-400" />, color: "text-amber-400" },
    { label: "Orders cancelled", value: agent?.cancellations, icon: <Package className="size-4 text-red-400" />, color: "text-red-400" },
    { label: "Orders edited", value: agent?.orderEdits, icon: <ShoppingCart className="size-4 text-blue-400" />, color: "text-blue-400" },
    { label: "Orders created", value: agent?.ordersCreated, icon: <ShoppingCart className="size-4 text-emerald-400" />, color: "text-emerald-400" },
    { label: "Address updates", value: agent?.addressUpdates, icon: <MapPin className="size-4 text-muted-foreground" />, color: "text-foreground" },
  ]

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Bot className="size-3.5 text-violet-400" />
            </div>
            <CardTitle className="text-sm">Agent Activity</CardTitle>
          </div>
          <ExportButton onClick={handleExport} disabled={isLoading || !agent} />
        </div>
      </CardHeader>

      <CardContent className="pt-5 flex-1 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Agent Runs", value: agent?.totalRuns, icon: <Bot className="size-4 text-violet-400/70" /> },
            { label: "Replies Sent", value: agent?.repliesSent, icon: <MessageSquare className="size-4 text-white/40" /> },
            { label: "Refunds", value: agent?.refundsIssued, icon: <RotateCcw className="size-4 text-amber-400/70" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                {icon}
              </div>
              {isLoading
                ? <Skeleton className="h-7 w-12" />
                : <p className="text-2xl font-extrabold text-foreground leading-none">{value?.toLocaleString() ?? "0"}</p>
              }
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          {actionItems.map(({ label, value, icon, color }) => (
            <div key={label} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                {icon}
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              {isLoading
                ? <Skeleton className="h-5 w-6" />
                : <span className={`text-sm font-bold ${value ? color : "text-muted-foreground/50"}`}>{value ?? 0}</span>
              }
            </div>
          ))}
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Top tools used</p>
          {isLoading ? (
            <div className="space-y-2">
              {["tool-skeleton-1", "tool-skeleton-2", "tool-skeleton-3", "tool-skeleton-4"].map((key) => <Skeleton key={key} className="h-5 w-full" />)}
            </div>
          ) : agent?.topTools.length ? (
            <div className="space-y-2">
              {agent.topTools.map(t => (
                <div key={t.tool} className="flex items-center gap-2.5">
                  <span className="text-xs text-muted-foreground w-32 shrink-0 truncate">{formatTool(t.tool)}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500/60 transition-all duration-500"
                      style={{ width: `${Math.round((t.count / maxTool) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-foreground w-6 text-right shrink-0">{t.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No agent activity yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
