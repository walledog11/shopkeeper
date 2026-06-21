import { MapPin } from "lucide-react"
import { locationString } from "@/lib/format/shopify"
import { CustomerAvatar } from "./CustomerAvatar"
import {
  SEGMENT_LABEL,
  customerSegment,
  formatLTV,
  fullName,
  type CustomerRow,
  type CustomerSegment,
} from "./customers-page-utils"

const SEGMENT_TONE: Record<CustomerSegment, string> = {
  vip: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  repeat: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  new: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  prospect: "border-foreground/[0.08] bg-foreground/[0.04] text-foreground/45",
}

export function CustomerCard({
  customer,
  isSelected,
  onClick,
}: {
  customer: CustomerRow
  isSelected: boolean
  onClick: () => void
}) {
  const name = fullName(customer)
  const location = locationString(customer.default_address)
  const ltv = formatLTV(customer.total_spent)
  const segment = customerSegment(customer)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col rounded-2xl border bg-card px-5 py-5 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/70 ${
        isSelected ? "border-foreground/30" : "border-border hover:border-foreground/20"
      }`}
    >
      <div className="flex items-start gap-3">
        <CustomerAvatar customer={customer} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold leading-tight text-foreground/90">{name}</p>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${SEGMENT_TONE[segment]}`}>
              {SEGMENT_LABEL[segment]}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-foreground/40">{customer.email}</p>
          {location && (
            <p className="mt-1 inline-flex items-center gap-1 truncate text-xs text-foreground/35">
              <MapPin className="size-3 shrink-0" />
              {location}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <span className="text-base font-bold text-foreground/85">{ltv}</span>
          <span className="ml-1 text-xs text-foreground/40">lifetime</span>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-foreground/45">
          {customer.orders_count} order{customer.orders_count !== 1 ? "s" : ""}
        </span>
      </div>
    </button>
  )
}
