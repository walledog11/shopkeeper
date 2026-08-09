import { formatRelativeTime } from "@/lib/format/date"
import { formatCurrency } from "@/lib/format/currency"
import type { OrderRow } from "@/lib/orders/order-contract"
import {
  financialPill,
  fulfillmentPill,
  lineItemsSummary,
  orderItemCount,
} from "./orders-board-model"
import {
  customerLabel,
  ORDER_COLUMN_ICON,
  ORDER_COLUMN_TONE,
  StatusPill,
  visibleOrderColumn,
} from "./order-presentation"

export function OrderCard({
  order,
  isPeek = false,
  onOpen,
}: {
  order: OrderRow
  isPeek?: boolean
  onOpen: () => void
}) {
  const columnId = visibleOrderColumn(order)
  const Icon = ORDER_COLUMN_ICON[columnId]
  const tone = ORDER_COLUMN_TONE[columnId]
  const financial = financialPill(order.financial_status)
  const fulfillment = fulfillmentPill(order.fulfillment_status)
  const summary = lineItemsSummary(order.line_items)
  const itemCount = orderItemCount(order)

  const body = (
    <>
      <div className="flex items-center gap-3">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-strong">{order.name}</h3>
            <span className="shrink-0 text-xs tabular-nums text-faint">
              {formatRelativeTime(order.created_at)}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-faint">{customerLabel(order)}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StatusPill label={financial.label} tone={financial.tone} />
        <StatusPill label={fulfillment.label} tone={fulfillment.tone} />
      </div>
      {summary ? <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{summary}</p> : null}
    </>
  )

  return (
    <article className={`rounded-2xl border border-border bg-card px-4 py-4 shadow-sm transition-colors ${tone.border}`}>
      {isPeek ? (
        <div className="block w-full border-0 bg-transparent p-0 text-left [font-family:inherit]">{body}</div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full border-0 bg-transparent p-0 text-left [font-family:inherit] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/70"
        >
          {body}
        </button>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">
          <span className="text-sm font-bold text-strong">{formatCurrency(order.total_price, order.currency)}</span>
          <span className="text-faint"> · {itemCount} item{itemCount !== 1 ? "s" : ""}</span>
        </span>
      </div>
    </article>
  )
}
