"use client"

import {
  BoardColumnEmpty,
  BoardColumnError,
  BoardColumnLoading,
  DashboardStackColumn,
} from "@/app/dashboard/_components/board/DashboardStackColumn"
import { STACKED_BELOW_PEEK } from "@/app/dashboard/_components/home/needs-you-motion"
import type { OrderRow } from "@/lib/orders/order-contract"
import { OrderCard } from "./OrderCard"
import { ORDER_COLUMN_ICON } from "./order-presentation"
import {
  ORDER_BOARD_COLUMNS,
  type BoardColumnId,
  type OrderColumnState,
} from "./orders-board-model"

export function OrderColumn({
  columnId,
  state,
  expanded,
  onExpandedChange,
  onOpenOrder,
  variant = "deck",
}: {
  columnId: BoardColumnId
  state: OrderColumnState
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onOpenOrder: (order: OrderRow) => void
  variant?: "deck" | "grid"
}) {
  const config = ORDER_BOARD_COLUMNS.find(column => column.id === columnId) ?? ORDER_BOARD_COLUMNS[0]
  const Icon = ORDER_COLUMN_ICON[columnId]

  return (
    <DashboardStackColumn
      label={config.label}
      state={state}
      icon={Icon}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      getId={order => String(order.id)}
      onOpenItem={onOpenOrder}
      renderCard={(order, { isPeek, onOpen }) => <OrderCard order={order} isPeek={isPeek} onOpen={onOpen} />}
      deckLabels={{ previous: "Previous order", next: "Next order" }}
      variant={variant}
      peek={STACKED_BELOW_PEEK}
      stackTestId="orders-stack-deck"
      expandedTestId="orders-stack-expanded"
      gridTestId="orders-grid"
      loading={<BoardColumnLoading testId="orders-column-loading" keyPrefix="orders-board-skeleton" cardClassName="h-36 rounded-2xl" shape="pills" />}
      errorContent={<BoardColumnError className="rounded-2xl" textClassName="text-red-700" onRetry={state.onRetry} />}
      empty={<BoardColumnEmpty title={config.emptyTitle} body={config.emptyBody} icon={Icon} className="h-36 rounded-2xl" />}
      loadingLabel="Loading…"
      peekShellClassName="h-full w-full rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] box-border"
      peekCardClassName="pointer-events-none box-border overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]"
      headerClassName="mb-3 flex items-center justify-between gap-3 px-1"
      titleClassName="truncate text-xs font-semibold uppercase tracking-normal text-strong"
    />
  )
}
