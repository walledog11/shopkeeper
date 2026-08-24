"use client"

import {
  NeedsYouCardBody,
  NeedsYouCardHeader,
  NeedsYouCardShell,
} from "@/app/dashboard/_components/home/needs-you-card-ui"
import type { OrderRow } from "@/lib/orders/order-contract"
import { lineItemsSummary } from "./orders-board-model"
import type { OrderAttentionFinding } from "./order-requests"
import { ShopCardMetaRow } from "./shop-card-ui"
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
      <NeedsYouCardShell>
        <NeedsYouCardHeader>
          <button
            type="button"
            onClick={onOpen}
            className="flex w-full min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left [font-family:inherit]"
          >
            <ShopCardMetaRow
              meta={{
                customerName: customerLabel(order),
                orderRef: order.name,
                lastMessageAt: order.created_at,
                statusLabel: status.label,
                statusTone: status.tone,
              }}
            />
          </button>
        </NeedsYouCardHeader>
        <NeedsYouCardBody className="gap-2 py-2.5 sm:py-3">
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
        </NeedsYouCardBody>
      </NeedsYouCardShell>
    </li>
  )
}

export function ShopFindingCard({
  finding,
  isOpening,
  error,
  onOpen,
}: {
  finding: OrderAttentionFinding
  isOpening: boolean
  error: string | null
  onOpen: () => void
}) {
  return (
    <li className="list-none">
      <NeedsYouCardShell>
        <NeedsYouCardHeader>
          <button
            type="button"
            onClick={onOpen}
            disabled={isOpening}
            className="flex w-full min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left [font-family:inherit] disabled:opacity-60"
          >
            <ShopCardMetaRow
              meta={{
                customerName: null,
                orderRef: finding.orderName,
                lastMessageAt: finding.at,
                statusLabel: "At risk",
                statusTone: "caution",
              }}
            />
          </button>
        </NeedsYouCardHeader>
        <NeedsYouCardBody className="gap-2 py-2.5 sm:py-3">
          <button
            type="button"
            onClick={onOpen}
            disabled={isOpening}
            className="w-full border-0 bg-transparent p-0 text-left [font-family:inherit] disabled:opacity-60"
          >
            <h3 className="mb-1.5 line-clamp-2 text-sm font-semibold leading-snug text-[#1a1a1a] sm:text-[15px]">
              {finding.reason}
            </h3>
            {error ? (
              <p className="text-sm leading-relaxed text-red-700">{error}</p>
            ) : (
              <p className="text-sm leading-relaxed text-[#6b5d4f]">
                Shopkeeper flagged this order for a look.
              </p>
            )}
          </button>
        </NeedsYouCardBody>
      </NeedsYouCardShell>
    </li>
  )
}
