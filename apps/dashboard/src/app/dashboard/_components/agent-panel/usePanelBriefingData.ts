"use client"

import { useMemo } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import {
  HOME_SUMMARY_REFRESH_INTERVAL_MS,
  createEmptyHomeSummary,
  type HomeSummary,
} from "@/lib/home/summary-contract"

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

  const summary = summaryData ?? createEmptyHomeSummary()
  const hasSummary = summaryData != null

  return {
    summary,
    ordersToShip: summary.ordersToShip,
    hasSummary,
    isLoading: enabled && isLoading && !hasSummary,
    hasError: enabled && error != null && !hasSummary,
  }
}
