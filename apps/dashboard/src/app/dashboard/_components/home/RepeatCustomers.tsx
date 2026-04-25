import Link from "next/link"

interface RepeatCustomer {
  customerId: string
  name: string
  initials: string
  ticketCount: number
}

interface Props {
  customers: RepeatCustomer[]
}

const COLORS = [
  'bg-pink-500/80 text-white',
  'bg-amber-500/80 text-white',
  'bg-violet-500/80 text-white',
  'bg-sky-500/80 text-white',
  'bg-emerald-500/80 text-white',
]

export default function RepeatCustomers({ customers }: Props) {
  if (customers.length === 0) return null

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-white/40">Repeat customers</p>
        <p className="text-[10px] text-white/35">contacted 3+ times in 30d</p>
      </div>
      <div className="rounded-md bg-card border border-border overflow-hidden divide-y divide-white/[0.04]">
        {customers.map((c, i) => (
          <Link
            key={c.customerId}
            href="/dashboard/tickets"
            className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.03] transition-colors"
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${COLORS[i % COLORS.length]}`}>
              {c.initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-white/85 truncate">{c.name}</p>
              <p className="text-[10px] text-white/35 truncate">{c.ticketCount} tickets</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
