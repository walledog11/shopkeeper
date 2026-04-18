"use client"

import { useEffect, useState } from "react"

export function useThreadPresence(ticketId: string) {
  const [presenceCount, setPresenceCount] = useState(0)

  useEffect(() => {
    const presenceUrl = `/api/threads/${ticketId}/presence`
    const heartbeat = () => fetch(presenceUrl, { method: "PUT" }).catch(() => {})
    const poll = () =>
      fetch(presenceUrl)
        .then(response => response.ok ? response.json() : { count: 0 })
        .then((data: { count: number }) => setPresenceCount(data.count))
        .catch(() => {})

    heartbeat()
    poll()

    const heartbeatTimer = setInterval(heartbeat, 15000)
    const pollTimer = setInterval(poll, 15000)

    return () => {
      clearInterval(heartbeatTimer)
      clearInterval(pollTimer)
      fetch(presenceUrl, { method: "DELETE" }).catch(() => {})
    }
  }, [ticketId])

  return { presenceCount }
}
