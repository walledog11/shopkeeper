import { fulfillmentLabel, formatMoney, formatShortDate } from "./formatters"
import { ProductImage } from "./ProductImage"
import { SectionHeader } from "./SectionHeader"
import { cn } from "@/lib/ui/cn"
import { needsYouMetaPillClassName } from "@/app/dashboard/_components/home/needs-you-card-styles"
import type { ShopifyOrder } from "@/types/shopify"

interface OrderListProps {
  orders: ShopifyOrder[]
  shop?: string
  olderOrderCount?: number
  showHeader?: boolean
  showOlderNote?: boolean
  showPastOrderPills?: boolean
}

function orderLabel(name: string) {
  return name.startsWith("#") ? name : `#${name.replace(/^#/, "")}`
}

function shopifyOrderUrl(shop: string | undefined, orderId: number) {
  return shop ? `https://${shop}/admin/orders/${orderId}` : null
}

export function OrderList({
  orders,
  shop,
  olderOrderCount = Math.max(orders.length - 1, 0),
  showHeader = true,
  showOlderNote = true,
  showPastOrderPills = false,
}: OrderListProps) {
  if (orders.length === 0) {
    return (
      <div>
        <SectionHeader title="Order" />
        <p className="text-xs text-muted-foreground">No orders found.</p>
      </div>
    )
  }
  const order = orders[0]
  const fulfillment = fulfillmentLabel(order.fulfillment_status)
  const orderDate = formatShortDate(order.created_at)

  return (
    <div>
      {showHeader && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6b5d4f]">
            Order {order.name}
          </span>
        </div>
      )}

      <div className="rounded-2xl bg-[#f5ebe0] p-3">
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
                  <p className="text-xs leading-4 font-semibold text-[#1a1a1a] truncate">
                    {item.title}
                  </p>
                  {skuParts.length > 0 && (
                    <p className="mt-0.5 font-mono text-xs leading-3 text-[#6b5d4f] truncate">
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
                <p className="text-xs leading-4 font-medium text-strong truncate">Order item</p>
              </div>
            </div>
          )}
          <div className="flex flex-row justify-between w-full">
            <p className="text-xs leading-4 font-semibold text-[#1a1a1a]">Order Total: </p>
            <span className="text-xs leading-4 font-semibold text-[#1a1a1a] tabular-nums shrink-0">
              {formatMoney(order.total_price, order.currency)}
            </span>
          </div>
        </div>

        <div className="my-2.5 border-t border-dashed border-[#1a1a1a]/10" />

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs leading-4 text-[#6b5d4f]">Status</span>
          <span className={`inline-flex items-center gap-1.5 text-xs leading-4 font-medium ${fulfillment.textClass}`}>
            <span className={`size-1.5 rounded-full ${fulfillment.dotClass}`} />
            {fulfillment.label}{orderDate ? ` - ${orderDate}` : ''}
          </span>
        </div>
      </div>

      {showPastOrderPills && (
        <div className="mt-3 flex flex-wrap gap-2">
          {orders.map(item => {
            const href = shopifyOrderUrl(shop, item.id)
            const label = orderLabel(item.name)
            const pillClass = cn(
              needsYouMetaPillClassName,
              "h-9 shrink-0 px-3 text-xs font-semibold text-[#1a1a1a] bg-[#f5ebe0] hover:bg-[#efe4d6]",
            )
            return href ? (
              <a
                key={item.id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={pillClass}
              >
                {label}
              </a>
            ) : (
              <span key={item.id} className={pillClass}>{label}</span>
            )
          })}
        </div>
      )}

      {showOlderNote && !showPastOrderPills && olderOrderCount > 0 && (
        <p className="mt-2 text-xs leading-4 text-faint">
          {olderOrderCount} older order{olderOrderCount !== 1 ? 's' : ''} available in Shopify.
        </p>
      )}
    </div>
  )
}
