"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { requestJson } from "@/lib/api/fetcher"
import type { Integration } from "@/types"

export const INTEGRATIONS_SWR_KEY = "/api/integrations"
export const INTEGRATIONS_REFRESH_INTERVAL_MS = 15_000

function useIsDocumentVisible() {
  const [isVisible, setIsVisible] = useState(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true,
  )

  useEffect(() => {
    const handler = () => setIsVisible(document.visibilityState === "visible")
    document.addEventListener("visibilitychange", handler)
    return () => document.removeEventListener("visibilitychange", handler)
  }, [])

  return isVisible
}

export function useIntegrations(options?: {
  enabled?: boolean
  refreshInterval?: number
}) {
  const enabled = options?.enabled ?? true
  const isVisible = useIsDocumentVisible()
  const refreshInterval = options?.refreshInterval ?? INTEGRATIONS_REFRESH_INTERVAL_MS

  return useSWR<Integration[]>(
    enabled ? INTEGRATIONS_SWR_KEY : null,
    (url) => requestJson<Integration[]>(url, { cache: "no-store" }),
    {
      refreshInterval: enabled && isVisible ? refreshInterval : 0,
      revalidateOnFocus: true,
      dedupingInterval: 2_000,
    },
  )
}
