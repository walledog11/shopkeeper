"use client"

import { useEffect } from "react"
import useSWR from "swr"

interface PresenceResponse {
  count: number
}

// The PUT doubles as heartbeat + read: it registers this viewer and returns
// how many other org members are viewing the thread.
async function heartbeat(url: string): Promise<PresenceResponse> {
  const response = await fetch(url, { method: "PUT" })
  return response.ok ? response.json() : { count: 0 }
}

export function useThreadPresence(ticketId: string) {
  const presenceUrl = `/api/threads/${ticketId}/presence`
  const { data } = useSWR<PresenceResponse>(presenceUrl, heartbeat, {
    refreshInterval: 15000,
    revalidateOnFocus: false,
  })

  useEffect(() => {
    return () => {
      void fetch(presenceUrl, { method: "DELETE" }).catch(() => {})
    }
  }, [presenceUrl])

  return { presenceCount: data?.count ?? 0 }
}
