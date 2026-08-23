"use client"

import { useCallback, useMemo, useState } from "react"
import useSWR from "swr"
import { errorMessageFromUnknown } from "@/lib/api/fetcher"
import {
  type BoardColumnId,
  type OrderColumnState,
  type OrdersBoardState,
} from "./orders-board-model"
import {
  fetchOrdersBoard,
  fetchOrdersColumnPage,
  ORDERS_BOARD_SWR_KEY,
  type OrdersBoardResponse,
} from "./order-requests"
import {
  appendOrderColumnPage,
  beginLoadingOrderColumn,
  createOrdersPaginationState,
  failLoadingOrderColumn,
  isOrdersBoardInitialLoading,
  mergeInitialBoardResponse,
  ordersInColumn,
} from "./orders-board-state"

export function useOrdersBoard(
  enabled: boolean,
  onShopLoaded: (shop: string) => void,
) {
  const [pagination, setPagination] = useState(createOrdersPaginationState)

  const applyBoardResponse = useCallback((response: OrdersBoardResponse) => {
    setPagination(current => mergeInitialBoardResponse(current, response))
    if (response.shop) onShopLoaded(response.shop)
  }, [onShopLoaded])

  const { error, isLoading, mutate } = useSWR(
    enabled ? ORDERS_BOARD_SWR_KEY : null,
    fetchOrdersBoard,
    {
      onSuccess: applyBoardResponse,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  )

  const loadMore = useCallback(async (columnId: BoardColumnId) => {
    const column = pagination[columnId]
    const nextPageInfo = column.nextPageInfo
    if (!nextPageInfo || column.isLoadingMore) return

    setPagination(current => beginLoadingOrderColumn(current, columnId))
    try {
      const page = await fetchOrdersColumnPage(columnId, nextPageInfo)
      setPagination(current => appendOrderColumnPage(current, columnId, page))
    } catch (loadError) {
      const message = errorMessageFromUnknown(loadError, "Unable to load more orders.")
      setPagination(current => failLoadingOrderColumn(current, columnId, message))
    }
  }, [pagination])

  const columns: OrdersBoardState = useMemo(() => {
    const buildColumn = (columnId: BoardColumnId): OrderColumnState => {
      const column = pagination[columnId]
      const entries = ordersInColumn(pagination, columnId)

      return {
        entries,
        error: entries.length === 0 ? error : null,
        hasMore: Boolean(column.nextPageInfo),
        isLoading: enabled && isLoading && !error && column.pages.length === 0,
        isLoadingMore: column.isLoadingMore,
        loadMoreError: column.loadMoreError,
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
    loadMore,
    mutate,
    pagination,
  ])

  const isInitialLoading = isOrdersBoardInitialLoading(enabled, isLoading, error, pagination)

  return {
    columns,
    error,
    isInitialLoading,
    mutate,
  }
}
