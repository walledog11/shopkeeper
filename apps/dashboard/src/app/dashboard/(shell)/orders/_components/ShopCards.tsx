"use client"

import {
  SupportCardBody,
  SupportCardHeader,
  SupportCardShell,
} from "@/components/support-card/card"
import type { OrderRow } from "@/lib/orders/order-contract"
import { lineItemsSummary } from "./orders-board-model"
import { TicketCardMetaRow } from "@/components/support-card/metadata"
import { customerLabel, orderStatusMeta } from "./shop-page-utils"

export function ShopOrderCard({
  order,
  onOpen,
}: {
  order: OrderRow
  onOpen: () => void
}) {
  const status = orderStatusMeta(order)
  const summary = lineItemsSummary(order.line_items)

  return (
    <li className="list-none">
      <SupportCardShell>
        <SupportCardHeader>
          <button
            type="button"
            onClick={onOpen}
            className="flex w-full min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left [font-family:inherit]"
          >
            <TicketCardMetaRow
              meta={{
                customerName: customerLabel(order),
                orderRef: order.name,
                lastMessageAt: order.created_at,
                statusLabel: status.label,
                statusTone: status.tone,
              }}
            />
          </button>
        </SupportCardHeader>
        <SupportCardBody className="gap-2 py-2.5 sm:py-3">
          <button
            type="button"
            onClick={onOpen}
            className="w-full border-0 bg-transparent p-0 text-left [font-family:inherit]"
          >
            {summary ? (
              <p className="line-clamp-2 text-sm leading-relaxed text-[#6b5d4f]">{summary}</p>
            ) : (
              <p className="text-sm leading-relaxed text-[#6b5d4f]/70">No line items recorded.</p>
            )}
          </button>
        </SupportCardBody>
      </SupportCardShell>
    </li>
  )
}
