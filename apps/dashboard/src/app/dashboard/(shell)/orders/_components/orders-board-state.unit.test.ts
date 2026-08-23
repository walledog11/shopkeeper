import { describe, expect, it } from "vitest"
import type { OrderRow, OrdersBoardResponse } from "@/lib/orders/order-contract"
import {
  appendOrderColumnPage,
  beginLoadingOrderColumn,
  createOrdersPaginationState,
  failLoadingOrderColumn,
  isOrdersBoardInitialLoading,
  mergeInitialBoardResponse,
  ordersInColumn,
} from "./orders-board-state"

function order(id: number): OrderRow {
  return {
    id,
    name: `#${id}`,
    created_at: "2026-08-01T00:00:00Z",
    financial_status: "paid",
    fulfillment_status: null,
    total_price: "10.00",
    currency: "USD",
    customer: null,
    line_items: [],
  }
}

function response(id: number): OrdersBoardResponse {
  return {
    shop: "store.myshopify.com",
    columns: {
      needs_fulfillment: { orders: [order(id)], nextPageInfo: "nf-next" },
      unpaid: { orders: [], nextPageInfo: "unpaid-next" },
      fulfilled: { orders: [], nextPageInfo: null },
    },
  }
}

describe("orders board pagination state", () => {
  it("tracks loading independently for each column", () => {
    const state = beginLoadingOrderColumn(createOrdersPaginationState(), "unpaid")
    expect(state.unpaid.isLoadingMore).toBe(true)
    expect(state.needs_fulfillment.isLoadingMore).toBe(false)
    expect(state.fulfilled.isLoadingMore).toBe(false)
  })

  it("deduplicates appended order ids while retaining pages", () => {
    let state = mergeInitialBoardResponse(createOrdersPaginationState(), response(1))
    state = appendOrderColumnPage(state, "needs_fulfillment", { orders: [order(1), order(2)], nextPageInfo: null })
    expect(ordersInColumn(state, "needs_fulfillment").map(item => item.id)).toEqual([1, 2])
    expect(state.needs_fulfillment.pages).toHaveLength(2)
  })

  it("keeps the cursor and loaded pages after a visible retryable failure", () => {
    let state = mergeInitialBoardResponse(createOrdersPaginationState(), response(1))
    state = appendOrderColumnPage(state, "unpaid", { orders: [order(2)], nextPageInfo: "retry-cursor" })
    state = beginLoadingOrderColumn(state, "unpaid")
    state = failLoadingOrderColumn(state, "unpaid", "Provider unavailable")
    expect(state.unpaid.nextPageInfo).toBe("retry-cursor")
    expect(state.unpaid.loadMoreError).toBe("Provider unavailable")
    expect(state.unpaid.pages).toHaveLength(2)

    state = beginLoadingOrderColumn(state, "unpaid")
    expect(state.unpaid.loadMoreError).toBeNull()
  })

  it("does not treat a failed board retry as the first paint", () => {
    const empty = createOrdersPaginationState()
    expect(isOrdersBoardInitialLoading(true, true, null, empty)).toBe(true)
    expect(isOrdersBoardInitialLoading(true, true, new Error("Unable to load orders."), empty)).toBe(false)
    expect(isOrdersBoardInitialLoading(true, false, new Error("Unable to load orders."), empty)).toBe(false)
  })

  it("revalidates the initial page without discarding loaded pages or their cursor", () => {
    let state = mergeInitialBoardResponse(createOrdersPaginationState(), response(1))
    state = appendOrderColumnPage(state, "needs_fulfillment", { orders: [order(2)], nextPageInfo: "third" })
    state = mergeInitialBoardResponse(state, response(3))
    expect(ordersInColumn(state, "needs_fulfillment").map(item => item.id)).toEqual([3, 2])
    expect(state.needs_fulfillment.nextPageInfo).toBe("third")
  })
})
