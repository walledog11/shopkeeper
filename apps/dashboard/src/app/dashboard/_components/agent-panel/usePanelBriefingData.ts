"use client"

import { useMemo } from "react"
import useSWR from "swr"
import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import { fetcher } from "@/lib/api/fetcher"
import {
  HOME_SUMMARY_REFRESH_INTERVAL_MS,
  createEmptyHomeSummary,
  type HomeSummary,
} from "@/lib/home/summary-contract"
import { useIntegrations } from "@/hooks/useIntegrations"
import { isShopifyIntegrationActive } from "@/lib/integrations/shopify-connection"

interface OrdersResponse {
  orders: Array<{
    fulfillment_status: string | null
    financial_status: string
  }>
}

export function usePanelBriefingData(enabled: boolean) {
  const {
    data: summaryData,
    error,
    isLoading,
  } = useSWR<HomeSummary>(
    enabled ? "/api/home-summary" : null,
    fetcher,
    { refreshInterval: HOME_SUMMARY_REFRESH_INTERVAL_MS },
  )

  const { data: integrations = [] } = useIntegrations({ enabled })

  const hasShopify = integrations.some(integration =>
    integration.platform === CHANNEL_TYPE.SHOPIFY && isShopifyIntegrationActive(integration),
  )

  const { data: ordersData } = useSWR<OrdersResponse>(
    enabled && hasShopify ? "/api/orders?limit=10" : null,
    fetcher,
    { refreshInterval: 300_000, revalidateOnFocus: false },
  )

  const ordersToShip = useMemo(() => {
    if (!ordersData?.orders) return null
    return ordersData.orders.filter(
      order => order.fulfillment_status == null && order.financial_status === "paid",
    ).length
  }, [ordersData])

  const summary = summaryData ?? createEmptyHomeSummary()
  const hasSummary = summaryData != null

  return {
    summary,
    ordersToShip,
    hasSummary,
    isLoading: enabled && isLoading && !hasSummary,
    hasError: enabled && error != null && !hasSummary,
  }
}
