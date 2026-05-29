"use client"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

interface Bucket {
  label: string
  count: number
}

interface TicketChartProps {
  chartTitle: string
  chartData: Bucket[]
  maxCount: number
  isLoading: boolean
}

export function TicketChart({ chartTitle, chartData, maxCount, isLoading }: TicketChartProps) {
  return (
    <Card className="gap-6">
      <CardHeader>
        <CardTitle className="text-sm">{chartTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {["day-0", "day-1", "day-2", "day-3", "day-4", "day-5", "day-6"].map((key) => (
              <div key={key} className="flex items-center gap-3 animate-pulse">
                <div className="w-12 h-3 bg-muted rounded" />
                <div className="flex-1 h-5 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {chartData.map((bucket) => (
              <div key={bucket.label} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-14 shrink-0 text-right">{bucket.label}</span>
                <div className="flex-1 flex items-center h-7 bg-muted rounded overflow-hidden">
                  {bucket.count > 0 ? (
                    <div
                      title={`${bucket.count} ticket${bucket.count !== 1 ? 's' : ''}`}
                      className="h-full bg-amber-500 hover:bg-amber-400 transition-all duration-500 flex items-center justify-end pr-2 rounded cursor-default"
                      style={{ width: `${Math.max((bucket.count / maxCount) * 100, 6)}%` }}
                    >
                      <span className="text-xs font-bold text-black">{bucket.count}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground pl-2">,</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
