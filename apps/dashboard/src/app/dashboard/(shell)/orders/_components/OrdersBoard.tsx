"use client"

import { useState } from "react"
import { useIsMobile } from "@/hooks/useMobile"
import { ReturnRequestsSection } from "./NeedsYouSection"
import { OrderColumn } from "./OrderColumn"
import { OrderDetailDialog } from "./OrderDetailDialog"
import {
  ORDER_BOARD_COLUMNS,
  type BoardColumnId,
  type OrdersBoardState,
} from "./orders-board-model"
import { useOrderSelection } from "./use-order-selection"

export function OrdersBoard({ columns, shop }: { columns: OrdersBoardState; shop: string | null }) {
  const [expandedColumns, setExpandedColumns] = useState<Partial<Record<BoardColumnId, boolean>>>({})
  const isMobile = useIsMobile()
  const allOrders = Object.values(columns).flatMap(column => column.entries)
  const selection = useOrderSelection(allOrders)
  const [featured, ...secondary] = ORDER_BOARD_COLUMNS

  const columnProps = (columnId: BoardColumnId) => ({
    columnId,
    state: columns[columnId],
    expanded: expandedColumns[columnId] ?? false,
    onExpandedChange: (expanded: boolean) => setExpandedColumns(current => ({ ...current, [columnId]: expanded })),
    onOpenOrder: selection.openOrder,
  })

  return (
    <>
      <div className="space-y-10">
        <OrderColumn {...columnProps(featured.id)} variant={isMobile ? "deck" : "grid"} />
        <ReturnRequestsSection />
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">Browse all</h2>
            <span className="h-px flex-1 bg-border/70" aria-hidden />
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2">
            {secondary.map(column => <OrderColumn key={column.id} {...columnProps(column.id)} />)}
          </div>
        </div>
      </div>
      <OrderDetailDialog order={selection.selectedOrder} shop={shop} onClose={selection.closeOrder} />
    </>
  )
}
