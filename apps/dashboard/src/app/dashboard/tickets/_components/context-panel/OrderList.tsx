import { ExternalLink } from "lucide-react"
import { panelSectionClass } from "./constants"
import { fulfillmentLabel, formatMoney, formatShortDate } from "./formatters"
import { ProductImage } from "./ProductImage"
import { SectionHeader } from "./SectionHeader"
import type { ShopifyOrder } from "@/types/shopify"

interface OrderListProps {
  orders: ShopifyOrder[]
  shop?: string
  olderOrderCount?: number
}

export function OrderList({ orders, shop, olderOrderCount = Math.max(orders.length - 1, 0) }: OrderListProps) {
  if (orders.length === 0) {
    return (
      <section className={panelSectionClass}>
        <SectionHeader title="ORDER" />
        <p className="text-xs text-white/40">No orders found.</p>
      </section>
    )
  }
  const order = orders[0]
  const fulfillment = fulfillmentLabel(order.fulfillment_status)
  const orderDate = formatShortDate(order.created_at)
  const adminUrl = shop ? `https://${shop}/admin/orders/${order.id}` : null

  return (
    <section className={panelSectionClass}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/40 truncate">
          ORDER {order.name}
        </span>
        {adminUrl && (
          <a
            href={adminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex size-6 items-center justify-center rounded text-white/30 hover:bg-white/[0.05] hover:text-white/70 transition-colors shrink-0"
            aria-label={`View order ${order.name} in Shopify`}
            title="View order in Shopify"
          >
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>

      <div className="rounded-md border border-white/[0.10] bg-white/[0.025] p-2.5">
        <div className="space-y-2">
          {order.line_items.map((item, index) => {
            const skuParts = [
              item.sku ? `SKU ${item.sku}` : null,
              item.variant_title,
              item.quantity > 1 ? `Qty ${item.quantity}` : null,
            ].filter(Boolean)

            return (
              <div key={`${item.title}-${item.variant_title ?? 'default'}-${index}`} className="flex items-center gap-2">
                <ProductImage src={item.image} title={item.title} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-4 font-medium text-white/80 truncate">
                    {item.title}
                  </p>
                  {skuParts.length > 0 && (
                    <p className="mt-0.5 font-mono text-xs leading-3 text-white/40 truncate">
                      {skuParts.join(' / ')}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
          {order.line_items.length === 0 && (
            <div className="flex items-center gap-2">
              <ProductImage src={null} title="Order item" />
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-4 font-medium text-white/80 truncate">Order item</p>
              </div>
            </div>
          )}
          <div className="flex flex-row justify-between w-full">
            <p className="text-xs leading-4 font-semibold text-white/80">Order Total: </p>
            <span className="text-xs leading-4 font-semibold text-white/80 tabular-nums shrink-0">
              {formatMoney(order.total_price, order.currency)}
            </span>
          </div>
        </div>

        <div className="my-2.5 border-t border-dashed border-white/[0.08]" />

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs leading-4 text-white/50">Status</span>
          <span className={`inline-flex items-center gap-1.5 text-xs leading-4 font-medium ${fulfillment.textClass}`}>
            <span className={`size-1.5 rounded-full ${fulfillment.dotClass}`} />
            {fulfillment.label}{orderDate ? ` - ${orderDate}` : ''}
          </span>
        </div>
      </div>

      {olderOrderCount > 0 && (
        <p className="mt-2 text-xs leading-4 text-white/30">
          {olderOrderCount} older order{olderOrderCount !== 1 ? 's' : ''} available in Shopify.
        </p>
      )}
    </section>
  )
}
