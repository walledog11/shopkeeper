"use client"

import { ExternalLink } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  NeedsYouCardBody,
  NeedsYouCardFooter,
  NeedsYouCardHeader,
} from "@/app/dashboard/_components/home/needs-you-card-ui"
import { needsYouCardShellClassName, needsYouSecondaryButtonClassName } from "@/app/dashboard/_components/home/needs-you-card-styles"
import { formatCurrency } from "@/lib/format/currency"
import { cn } from "@/lib/ui/cn"
import type { OrderRow } from "@/lib/orders/order-contract"
import { orderItemCount } from "./orders-board-model"
import { ShopCardMetaRow } from "./shop-card-ui"
import { customerLabel, orderStatusMeta, shopifyAdminOrderHref } from "./shop-page-utils"

function OrderDetail({ order, shop }: { order: OrderRow; shop: string | null }) {
  const status = orderStatusMeta(order)
  const itemCount = orderItemCount(order)
  const adminHref = shopifyAdminOrderHref(shop, order.id)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NeedsYouCardHeader className="pr-12">
        <ShopCardMetaRow
          meta={{
            customerName: customerLabel(order),
            orderRef: order.name,
            lastMessageAt: order.created_at,
            statusLabel: status.label,
            statusTone: status.tone,
          }}
        />
      </NeedsYouCardHeader>

      <NeedsYouCardBody className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {order.customer?.email ? (
          <p className="text-sm leading-relaxed text-[#6b5d4f]">{order.customer.email}</p>
        ) : null}

        <div className="space-y-2">
          {order.line_items.length > 0 ? order.line_items.map((item, index) => (
            <div
              key={`${item.title}-${index}`}
              className="flex items-start justify-between gap-3 rounded-2xl bg-white px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_6px_18px_rgba(0,0,0,0.08)]"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#1a1a1a]">{item.title}</p>
                {item.variant_title ? (
                  <p className="text-xs text-[#6b5d4f]">{item.variant_title}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-sm tabular-nums text-[#6b5d4f]">×{item.quantity}</span>
            </div>
          )) : (
            <p className="text-sm text-[#6b5d4f]">No line items recorded.</p>
          )}
        </div>

        <p className="text-sm leading-snug">
          <span className="font-bold text-[#1a1a1a]">{formatCurrency(order.total_price, order.currency)}</span>
          <span className="text-[#6b5d4f]/50"> · </span>
          <span className="text-[#6b5d4f]">{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
        </p>
      </NeedsYouCardBody>

      {adminHref ? (
        <NeedsYouCardFooter className="px-4 py-3 sm:px-5">
          <a
            href={adminHref}
            target="_blank"
            rel="noreferrer"
            className={cn(needsYouSecondaryButtonClassName, "gap-2 text-sm")}
          >
            <ExternalLink className="size-3.5" />
            View in Shopify
          </a>
        </NeedsYouCardFooter>
      ) : null}
    </div>
  )
}

export function OrderDetailDialog({
  order,
  shop,
  onClose,
}: {
  order: OrderRow | null
  shop: string | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(order)} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton
        className={cn(
          needsYouCardShellClassName("shell"),
          "fixed left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-border bg-card p-0 pt-[env(safe-area-inset-top)] sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[86vh] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:pt-0 sm:max-w-2xl",
        )}
      >
        <DialogTitle className="sr-only">{order ? `${order.name} detail` : "Order detail"}</DialogTitle>
        {order ? <OrderDetail order={order} shop={shop} /> : null}
      </DialogContent>
    </Dialog>
  )
}
