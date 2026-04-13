import Link from "next/link"
import { Inbox, CheckCircle2, Clock, MessageSquare } from "lucide-react"

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function openCountColor(count: number): string {
  if (count === 0) return "text-green-400"
  if (count >= 10) return "text-amber-400"
  return "text-white"
}

interface Props {
  isLoading: boolean
  openCount: number
  resolvedTodayCount: number
  avgResponseMinutes: number | null
  totalMessageCount: number
}

export default function StatCards({ isLoading, openCount, resolvedTodayCount, avgResponseMinutes, totalMessageCount }: Props) {
  const dash = <span className="text-white/15">—</span>

  return (
    <div className="grid grid-cols-2 @min-[640px]:grid-cols-4 gap-3 shrink-0">

      {/* OPEN */}
      <Link
        href="/dashboard/tickets"
        className="group flex items-center justify-between px-4 py-2.5 rounded-md bg-card border border-border hover:border-white/[0.14] transition-colors"
      >
        <div>
          <p className="text-[11px] text-white/35 mb-1 font-medium">Open tickets</p>
          <p className={`text-3xl font-bold tabular-nums leading-none transition-colors ${isLoading ? "" : openCountColor(openCount)}`}>
            {isLoading ? dash : openCount}
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0">
          <Inbox className="w-3.5 h-3.5 text-white/35" />
        </div>
      </Link>

      {/* RESOLVED TODAY */}
      <Link
        href="/dashboard/analytics"
        className="group flex items-center justify-between px-4 py-2.5 rounded-md bg-card border border-border hover:border-white/[0.14] transition-colors"
      >
        <div>
          <p className="text-[11px] text-white/35 mb-1 font-medium">Resolved today</p>
          <p className="text-3xl font-bold tabular-nums text-white leading-none">
            {isLoading ? dash : resolvedTodayCount}
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-white/35" />
        </div>
      </Link>

      {/* AVG RESPONSE TIME */}
      <Link
        href="/dashboard/analytics"
        className="group flex items-center justify-between px-4 py-2.5 rounded-md bg-card border border-border hover:border-white/[0.14] transition-colors"
      >
        <div>
          <p className="text-[11px] text-white/35 mb-1 font-medium">Avg response <span className="text-white/20">(7d)</span></p>
          <p className="text-3xl font-bold tabular-nums text-white leading-none">
            {avgResponseMinutes == null ? dash : formatMinutes(Math.round(avgResponseMinutes))}
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0">
          <Clock className="w-3.5 h-3.5 text-white/35" />
        </div>
      </Link>

      {/* TOTAL MESSAGES */}
      <Link
        href="/dashboard/analytics"
        className="group flex items-center justify-between px-4 py-2.5 rounded-md bg-card border border-border hover:border-white/[0.14] transition-colors"
      >
        <div>
          <p className="text-[11px] text-white/35 mb-1 font-medium">Messages <span className="text-white/20">(all time)</span></p>
          <p className="text-3xl font-bold tabular-nums text-white leading-none">
            {totalMessageCount.toLocaleString()}
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0">
          <MessageSquare className="w-3.5 h-3.5 text-white/35" />
        </div>
      </Link>

    </div>
  )
}
