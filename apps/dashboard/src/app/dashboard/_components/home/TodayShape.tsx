import Link from "next/link"

interface Props {
  ordersToShip: number | null
  refundsPending: number
  vipsInQueue: number
}

type Tone = 'good' | 'warn' | 'neutral'

interface Row {
  label: string
  href: string
  sublabel: string
  count: number
  tone: Tone
}

const TONE_CLASS: Record<Tone, string> = {
  good: 'text-green-400',
  warn: 'text-amber-400',
  neutral: 'text-white',
}

export default function TodayShape({ ordersToShip, refundsPending, vipsInQueue }: Props) {
  const now = new Date()
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  const rows: Row[] = []
  if (ordersToShip != null) {
    rows.push({
      label: 'Orders to ship',
      href: '/dashboard/orders',
      sublabel: 'unfulfilled',
      count: ordersToShip,
      tone: ordersToShip > 0 ? 'neutral' : 'good',
    })
  }
  rows.push({
    label: 'Refunds pending',
    href: '/dashboard/tickets?tag=Returns',
    sublabel: 'awaiting your call',
    count: refundsPending,
    tone: refundsPending > 0 ? 'warn' : 'neutral',
  })
  rows.push({
    label: 'VIPs in queue',
    href: '/dashboard/tickets',
    sublabel: 'repeat customers',
    count: vipsInQueue,
    tone: vipsInQueue > 0 ? 'warn' : 'neutral',
  })

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <p className="text-xs uppercase tracking-wider font-semibold text-white/40">{dateLabel}</p>
      </div>
      <div className="space-y-1.5">
        {rows.map(row => (
          <Link
            key={row.label}
            href={row.href}
            className="flex items-center justify-between px-3 py-2.5 rounded-md bg-card border border-border hover:border-white/[0.14] transition-colors"
          >
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-white/85 truncate">{row.label}</p>
              <p className="text-xs text-white/35 truncate">{row.sublabel}</p>
            </div>
            <span className={`text-xl font-bold tabular-nums shrink-0 ${TONE_CLASS[row.tone]}`}>{row.count}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
