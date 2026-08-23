import {
  ORDER_BOARD_COLUMN_IDS,
  type OrderBoardColumnId,
  type OrderRow,
  type OrdersBoardResponse,
} from "@/lib/orders/order-contract"
import { dedupeOrders } from "./orders-board-model"

export interface OrderPaginationColumn {
  pages: OrderRow[][]
  nextPageInfo: string | null
  isLoadingMore: boolean
  loadMoreError: string | null
}

export type OrdersPaginationState = Record<OrderBoardColumnId, OrderPaginationColumn>

function emptyColumn(): OrderPaginationColumn {
  return { pages: [], nextPageInfo: null, isLoadingMore: false, loadMoreError: null }
}

export function createOrdersPaginationState(): OrdersPaginationState {
  return {
    needs_fulfillment: emptyColumn(),
    unpaid: emptyColumn(),
    fulfilled: emptyColumn(),
  }
}

export function mergeInitialBoardResponse(
  state: OrdersPaginationState,
  response: OrdersBoardResponse,
): OrdersPaginationState {
  return Object.fromEntries(ORDER_BOARD_COLUMN_IDS.map((columnId) => {
    const current = state[columnId]
    const initial = response.columns[columnId]
    const hasLoadedPages = current.pages.length > 1
    return [columnId, {
      ...current,
      pages: [initial.orders, ...current.pages.slice(1)],
      nextPageInfo: hasLoadedPages ? current.nextPageInfo : initial.nextPageInfo,
      loadMoreError: null,
    }]
  })) as OrdersPaginationState
}

export function beginLoadingOrderColumn(
  state: OrdersPaginationState,
  columnId: OrderBoardColumnId,
): OrdersPaginationState {
  return {
    ...state,
    [columnId]: { ...state[columnId], isLoadingMore: true, loadMoreError: null },
  }
}

export function appendOrderColumnPage(
  state: OrdersPaginationState,
  columnId: OrderBoardColumnId,
  page: { orders: OrderRow[]; nextPageInfo: string | null },
): OrdersPaginationState {
  return {
    ...state,
    [columnId]: {
      ...state[columnId],
      pages: [...state[columnId].pages, page.orders],
      nextPageInfo: page.nextPageInfo,
      isLoadingMore: false,
      loadMoreError: null,
    },
  }
}

export function failLoadingOrderColumn(
  state: OrdersPaginationState,
  columnId: OrderBoardColumnId,
  message: string,
): OrdersPaginationState {
  return {
    ...state,
    [columnId]: {
      ...state[columnId],
      isLoadingMore: false,
      loadMoreError: message,
    },
  }
}

export function ordersInColumn(state: OrdersPaginationState, columnId: OrderBoardColumnId): OrderRow[] {
  return dedupeOrders(state[columnId].pages.flat())
}

/** True only for the first paint — not for SWR error retries, which also set isLoading. */
export function isOrdersBoardInitialLoading(
  enabled: boolean,
  isLoading: boolean,
  error: unknown,
  pagination: OrdersPaginationState,
): boolean {
  return enabled
    && isLoading
    && !error
    && ORDER_BOARD_COLUMN_IDS.every(columnId => pagination[columnId].pages.length === 0)
}
