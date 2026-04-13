"use client"

import { Inbox, CheckCircle2, MessageSquare, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface OverviewStatsProps {
  totalThreads: number
  openCount: number
  closedCount: number
  totalMessages: number
  resolutionRate: number
  isLoading: boolean
}

const STATS = [
  { key: 'total',    label: 'Total Tickets',  Icon: Inbox         },
  { key: 'open',     label: 'Open',           Icon: Inbox         },
  { key: 'resolved', label: 'Resolved',       Icon: CheckCircle2  },
  { key: 'messages', label: 'Total Messages', Icon: MessageSquare },
]

export function OverviewStats({ totalThreads, openCount, closedCount, totalMessages, resolutionRate, isLoading }: OverviewStatsProps) {
  const values: Record<string, number> = {
    total: totalThreads, open: openCount, resolved: closedCount, messages: totalMessages,
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATS.map(({ key, label, Icon }) => (
          <Card key={key} className="hover:border-white/[0.14] transition-all">
            <CardContent className="px-4 py-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                {isLoading ? (
                  <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                ) : (
                  <p className="text-3xl font-extrabold leading-none text-foreground">{values[key].toLocaleString()}</p>
                )}
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                <Icon className="w-5 h-5 text-white/40" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!isLoading && (
        <Card>
          <CardContent className="px-5 py-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <p className="text-sm font-bold text-foreground">Resolution Rate</p>
              </div>
              <span className="text-sm font-extrabold text-primary">{resolutionRate}%</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${resolutionRate}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">{closedCount} of {totalThreads} tickets resolved</p>
          </CardContent>
        </Card>
      )}
    </>
  )
}
