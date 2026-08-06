"use client"

import { useCallback, useMemo, useState } from "react"
import useSWR from "swr"
import { errorMessageFromUnknown } from "@/lib/api/fetcher"
import type { OrderColumnState, OrdersBoardState } from "./OrdersBoard"
import {
  classifyOrder,
  type BoardColumnId,
  type OrderRow,
} from "./orders-board-model"
import {
  fetchOrdersBoard,
  fetchOrdersPage,
  ORDERS_BOARD_SWR_KEY,
  type OrdersBoardResponse,
} from "./order-requests"

const BOARD_COLUMN_IDS: BoardColumnId[] = ["needs_fulfillment", "unpaid", "fulfilled"]

function emptyPagesByColumn(): Record<BoardColumnId, OrderRow[][]> {
  return {
    needs_fulfillment: [],
    unpaid: [],
    fulfilled: [],
  }
}

function emptyNextPageInfoByColumn(): Record<BoardColumnId, string | null> {
  return {
    needs_fulfillment: null,
    unpaid: null,
    fulfilled: null,
  }
}

export function useOrdersBoard(
  enabled: boolean,
  onShopLoaded: (shop: string) => void,
) {
  const [pagesByColumn, setPagesByColumn] = useState(emptyPagesByColumn)
  const [nextPageInfoByColumn, setNextPageInfoByColumn] = useState(emptyNextPageInfoByColumn)
  const [loadingMoreColumn, setLoadingMoreColumn] = useState<BoardColumnId | null>(null)

  const applyBoardResponse = useCallback((response: OrdersBoardResponse) => {
    setPagesByColumn({
      needs_fulfillment: [response.columns.needs_fulfillment.orders],
      unpaid: [response.columns.unpaid.orders],
      fulfilled: [response.columns.fulfilled.orders],
    })
    setNextPageInfoByColumn({
      needs_fulfillment: response.columns.needs_fulfillment.nextPageInfo,
      unpaid: response.columns.unpaid.nextPageInfo,
      fulfilled: response.columns.fulfilled.nextPageInfo,
    })
    if (response.shop) onShopLoaded(response.shop)
  }, [onShopLoaded])

  const { error, isLoading, isValidating, mutate } = useSWR(
    enabled ? ORDERS_BOARD_SWR_KEY : null,
    fetchOrdersBoard,
    {
      onSuccess: applyBoardResponse,
      revalidateOnFocus: false,
    },
  )

  const loadMore = useCallback(async (columnId: BoardColumnId) => {
    const nextPageInfo = nextPageInfoByColumn[columnId]
    if (!nextPageInfo || loadingMoreColumn) return

    setLoadingMoreColumn(columnId)
    try {
      const page = await fetchOrdersPage(nextPageInfo)
      setPagesByColumn(prev => ({
        ...prev,
        [columnId]: [...prev[columnId], page.orders],
      }))
      setNextPageInfoByColumn(prev => ({
        ...prev,
        [columnId]: page.nextPageInfo,
      }))
    } catch (loadError) {
      errorMessageFromUnknown(loadError, "Unable to load more orders.")
    } finally {
      setLoadingMoreColumn(null)
    }
  }, [loadingMoreColumn, nextPageInfoByColumn])

  const columns: OrdersBoardState = useMemo(() => {
    const buildColumn = (columnId: BoardColumnId): OrderColumnState => {
      const entries = pagesByColumn[columnId]
        .flat()
        .filter(order => classifyOrder(order) === columnId)

      return {
        entries,
        error,
        hasMore: Boolean(nextPageInfoByColumn[columnId]),
        isLoading: enabled && isLoading && pagesByColumn[columnId].length === 0,
        isValidating,
        isLoadingMore: loadingMoreColumn === columnId,
        onLoadMore: () => { void loadMore(columnId) },
        onRetry: () => { void mutate() },
      }
    }

    return {
      needs_fulfillment: buildColumn("needs_fulfillment"),
      unpaid: buildColumn("unpaid"),
      fulfilled: buildColumn("fulfilled"),
    }
  }, [
    enabled,
    error,
    isLoading,
    isValidating,
    loadMore,
    loadingMoreColumn,
    mutate,
    nextPageInfoByColumn,
    pagesByColumn,
  ])

  const isInitialLoading = enabled
    && isLoading
    && BOARD_COLUMN_IDS.every(columnId => pagesByColumn[columnId].length === 0)

  return {
    columns,
    error,
    isInitialLoading,
    mutate,
  }
}
