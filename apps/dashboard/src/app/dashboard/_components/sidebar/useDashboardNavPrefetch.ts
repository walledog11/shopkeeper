"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"

export function useDashboardNavPrefetch() {
  const router = useRouter()

  return useCallback((href: string) => {
    router.prefetch(href)
  }, [router])
}

export function dashboardNavPrefetchHandlers(
  prefetch: (href: string) => void,
  href: string,
) {
  return {
    onMouseEnter: () => prefetch(href),
    onFocus: () => prefetch(href),
  }
}
