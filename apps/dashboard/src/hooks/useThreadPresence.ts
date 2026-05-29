"use client"

import { useEffect } from "react"
import useSWR from "swr"

interface PresenceResponse {
  count: number
}

async function fetchPresence(url: string): Promise<PresenceResponse> {
  const response = await fetch(url)
  return response.ok ? response.json() : { count: 0 }
}

function sendPresence(url: string, method: "PUT" | "DELETE") {
  return fetch(url, { method }).catch(() => {})
}

export function useThreadPresence(ticketId: string) {
  const presenceUrl = `/api/threads/${ticketId}/presence`
  const { data } = useSWR<PresenceResponse>(presenceUrl, fetchPresence, {
    refreshInterval: 15000,
    revalidateOnFocus: false,
  })

  useEffect(() => {
    const heartbeat = () => sendPresence(presenceUrl, "PUT")

    void heartbeat()

    const heartbeatTimer = setInterval(heartbeat, 15000)

    return () => {
      clearInterval(heartbeatTimer)
      void sendPresence(presenceUrl, "DELETE")
    }
  }, [presenceUrl])

  return { presenceCount: data?.count ?? 0 }
}
