"use client"

import { useState } from "react"
import type { OrderRow } from "@/lib/orders/order-contract"

export function useOrderSelection(orders: readonly OrderRow[]) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selectedOrder = selectedId === null ? null : orders.find(order => order.id === selectedId) ?? null
  return {
    selectedOrder,
    openOrder: (order: OrderRow) => setSelectedId(order.id),
    closeOrder: () => setSelectedId(null),
  }
}
