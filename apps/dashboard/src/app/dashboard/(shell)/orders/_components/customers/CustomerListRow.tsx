import { ChevronRight } from "lucide-react"
import { CustomerAvatar } from "./CustomerAvatar"
import { formatLTV, fullName, type CustomerRow } from "./customers-page-utils"
import { locationString } from "@/lib/format/shopify"

export function CustomerListRow({ customer, isSelected, onClick }: {
  customer: CustomerRow
  isSelected: boolean
  onClick: () => void
}) {
  const name = fullName(customer)
  const location = locationString(customer.default_address)
  const ltv = formatLTV(customer.total_spent)

  return (
    <button type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors group ${
        isSelected
          ? "bg-accent"
          : "hover:bg-accent/50"
      }`}
    >
      <CustomerAvatar customer={customer} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate leading-tight">{name}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{customer.email}</p>
        {location && (
          <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{location}</p>
        )}
      </div>

      <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-sm font-bold text-foreground/80">{ltv}</span>
        <span className="text-xs text-muted-foreground">
          {customer.orders_count} order{customer.orders_count !== 1 ? "s" : ""}
        </span>
      </div>

      <ChevronRight className={`size-4 shrink-0 transition-colors ${
        isSelected ? "text-muted-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground"
      }`} />
    </button>
  )
}
