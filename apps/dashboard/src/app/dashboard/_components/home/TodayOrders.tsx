import Link from "next/link"
import { ArrowRight } from "lucide-react"

interface Order {
  id: number
  name: string
  customerName: string
  summary: string
  status: 'ship' | 'refund'
  amount: string | null
}

interface Props {
  orders: Order[]
  hasShopify: boolean
}

const STATUS_LABEL: Record<Order['status'], string> = {
  ship: 'SHIP',
  refund: 'REFUND',
}

const STATUS_COLOR: Record<Order['status'], string> = {
  ship:   'text-white/45 bg-white/[0.06] border-white/[0.08]',
  refund: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
}

export default function TodayOrders({ orders, hasShopify }: Props) {
  if (!hasShopify) {
    return (
      <div className="flex flex-col gap-2.5">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-white/40">Today&apos;s orders</p>
        <Link
          href="/dashboard/integrations"
          className="px-3 py-4 rounded-md bg-card border border-border hover:border-white/[0.14] transition-colors text-center"
        >
          <p className="text-xs text-white/55">Connect Shopify to see today&apos;s orders here.</p>
          <p className="text-[11px] font-semibold text-green-400 mt-2">Connect Shopify →</p>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-white/40">Today&apos;s orders</p>
        <Link href="/dashboard/orders" className="text-[10px] text-white/35 hover:text-white/70 inline-flex items-center gap-0.5">
          View all <ArrowRight className="w-2.5 h-2.5" />
        </Link>
      </div>
      <div className="rounded-md bg-card border border-border overflow-hidden">
        {orders.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-white/30">No orders to show.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {orders.map(o => (
              <Link
                key={o.id}
                href="/dashboard/orders"
                className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.03] transition-colors"
              >
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider border ${STATUS_COLOR[o.status]}`}>
                  {STATUS_LABEL[o.status]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-white/80 truncate">
                    <span className="text-white/40 tabular-nums mr-1">{o.name}</span>
                    <span className="font-semibold">{o.customerName}</span>
                  </p>
                  <p className="text-[10px] text-white/35 truncate">
                    {o.status === 'refund' && o.amount ? `$${o.amount} · awaiting your call` : o.summary || '—'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
