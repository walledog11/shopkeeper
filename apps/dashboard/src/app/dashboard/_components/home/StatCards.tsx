import Link from "next/link"
import Sparkline from "./Sparkline"

function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    const whole = Math.floor(minutes)
    const secs = Math.round((minutes - whole) * 60)
    return secs > 0 ? `${whole}m ${secs}s` : `${whole}m`
  }
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const DASH = <span className="text-white/15">—</span>

interface CardProps {
  href: string
  label: string
  value: React.ReactNode
  spark: number[]
  footer: React.ReactNode
  footerClass?: string
}

function StatCard({ href, label, value, spark, footer, footerClass }: CardProps) {
  return (
    <Link
      href={href}
      className="flex flex-col justify-between px-4 py-3 rounded-md bg-card border border-border hover:border-white/[0.14] transition-colors min-h-[88px]"
    >
      <p className="text-[10px] uppercase tracking-wider font-semibold text-white/40">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-3xl font-bold tabular-nums text-white leading-none">{value}</p>
        <Sparkline data={spark} color="#4ade80" className="opacity-70" />
      </div>
      <p className={`text-[11px] tabular-nums ${footerClass ?? 'text-white/30'}`}>{footer}</p>
    </Link>
  )
}

interface Props {
  isLoading: boolean
  openCount: number
  openDelta: number | null
  firstReplyMinutes: number | null
  autoResolvedPct: number | null
  weeklyVolume: number
  newThreadsByDay: number[]
  aiResolvedByDay: number[]
  totalRepliesByDay: number[]
}

export default function StatCards({
  isLoading,
  openCount,
  openDelta,
  firstReplyMinutes,
  autoResolvedPct,
  weeklyVolume,
  newThreadsByDay,
  aiResolvedByDay,
  totalRepliesByDay,
}: Props) {
  let openFooter: React.ReactNode = '—'
  let openFooterClass = 'text-white/30'
  if (openDelta != null) {
    if (openDelta === 0) {
      openFooter = '0 vs yesterday'
    } else {
      const sign = openDelta > 0 ? '+' : ''
      openFooter = `${sign}${openDelta} vs yesterday`
      openFooterClass = openDelta > 0 ? 'text-amber-400' : 'text-green-400'
    }
  }

  return (
    <div className="grid grid-cols-2 @min-[640px]:grid-cols-4 gap-3 shrink-0">
      <StatCard
        href="/dashboard/tickets"
        label="Open"
        value={isLoading ? DASH : openCount}
        spark={newThreadsByDay}
        footer={openFooter}
        footerClass={openFooterClass}
      />
      <StatCard
        href="/dashboard/analytics"
        label="First reply"
        value={firstReplyMinutes == null ? DASH : formatMinutes(firstReplyMinutes)}
        spark={totalRepliesByDay}
        footer="7-day avg"
      />
      <StatCard
        href="/dashboard/analytics"
        label="Auto-resolved"
        value={autoResolvedPct == null ? DASH : `${autoResolvedPct}%`}
        spark={aiResolvedByDay}
        footer="7-day rate"
      />
      <StatCard
        href="/dashboard/analytics"
        label="Volume (7d)"
        value={weeklyVolume.toLocaleString()}
        spark={newThreadsByDay}
        footer="tickets received"
      />
    </div>
  )
}
