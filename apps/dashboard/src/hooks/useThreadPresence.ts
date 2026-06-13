"use client"

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

  return { presenceCount: data?.count ?? 0 }
}
