"use client"

import { MessageSquare } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExportButton } from "./ExportButton"
import { Skeleton } from "./Skeleton"
import {
  TAG_BADGE_COLORS,
  TAG_BAR_COLORS,
  downloadCSV,
  type ReportsData,
} from "./reports-helpers"

export function TopTopicsCard({
  data,
  isLoading,
  rangeLabel,
}: {
  data: ReportsData
  isLoading: boolean
  rangeLabel: string
}) {
  const byTag = data?.support.byTag ?? []
  const total = byTag.reduce((sum, tag) => sum + tag.count, 0)
  const maxCount = Math.max(...byTag.map(tag => tag.count), 1)

  function handleExport() {
    if (!byTag.length) return
    downloadCSV(`top-topics-${rangeLabel.replace(/\s/g, "-")}.csv`, [
      ["Topic", "Tickets", "% of Total"],
      ...byTag.map(tag => [tag.tag, tag.count, total > 0 ? `${Math.round((tag.count / total) * 100)}%` : ","]),
    ])
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <MessageSquare className="size-3.5 text-emerald-400" />
            </div>
            <CardTitle className="text-sm">Top Topics</CardTitle>
          </div>
          <ExportButton onClick={handleExport} disabled={isLoading || !byTag.length} />
        </div>
      </CardHeader>

      <CardContent className="pt-5 flex-1">
        {isLoading ? (
          <div className="space-y-3">
            {["tag-skeleton-1", "tag-skeleton-2", "tag-skeleton-3", "tag-skeleton-4", "tag-skeleton-5"].map((key) => (
              <div key={key} className="space-y-1.5">
                <div className="flex justify-between">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-10" />
                </div>
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        ) : byTag.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-sm text-muted-foreground">No tagged tickets yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Tags are assigned automatically by AI</p>
          </div>
        ) : (
          <div className="space-y-3">
            {byTag.map(tag => {
              const pct = total > 0 ? Math.round((tag.count / total) * 100) : 0
              const barColor = TAG_BAR_COLORS[tag.tag] ?? "bg-primary/60"
              const badgeColor = TAG_BADGE_COLORS[tag.tag] ?? "bg-muted text-muted-foreground border-border"
              return (
                <div key={tag.tag}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${badgeColor}`}>
                        {tag.tag}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                      <span className="text-xs font-semibold text-foreground w-5 text-right">{tag.count}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${Math.round((tag.count / maxCount) * 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}

            {total > 0 && (
              <p className="text-xs text-muted-foreground pt-1">
                {total} tagged ticket{total !== 1 ? "s" : ""} in this period
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
