"use client"

import { useEffect, useState } from "react"
import { useSWRConfig } from "swr"
import { GATEWAY_EVENTS_URL, REALTIME_ENABLED } from "@/lib/realtime/config"
import {
  RealtimeConnectionProvider,
  type RealtimeConnectionStatus,
} from "./RealtimeConnectionContext"

// Keys whose data reflects inbound thread activity. A pushed event just says
// "something changed" — we revalidate these through SWR's normal authenticated
// fetch rather than trusting any payload.
function shouldRevalidate(key: unknown): boolean {
  if (typeof key === "string") {
    return key.startsWith("/api/threads")
      || key.startsWith("/api/search")
      || key === "/api/home-summary"
  }
  if (Array.isArray(key)) {
    return key.some(part => typeof part === "string" && shouldRevalidate(part))
  }
  return false
}

// One EventSource per tab. Bridges gateway-published thread events into SWR cache
// revalidation; reconnects with backoff and a fresh token; catches up on focus.
export default function RealtimeProvider({ children }: { children?: React.ReactNode }) {
  const { mutate } = useSWRConfig()
  const [status, setStatus] = useState<RealtimeConnectionStatus>(
    REALTIME_ENABLED ? "connecting" : "disabled",
  )

  useEffect(() => {
    if (!REALTIME_ENABLED) {
      setStatus("disabled")
      return
    }
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      setStatus("disabled")
      return
    }

    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let backoff = 1000
    let closed = false
    let hasConnectedOnce = false

    const revalidate = () => { void mutate(shouldRevalidate) }

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return
      setStatus(hasConnectedOnce ? "reconnecting" : "connecting")
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        void connect()
      }, backoff)
      backoff = Math.min(backoff * 2, 30_000)
    }

    async function connect() {
      if (closed) return
      setStatus(hasConnectedOnce ? "reconnecting" : "connecting")

      let token: string
      try {
        const res = await fetch("/api/realtime/token")
        if (!res.ok) throw new Error(`token ${res.status}`)
        token = (await res.json()).token
      } catch {
        scheduleReconnect()
        return
      }
      if (closed) return

      const es = new EventSource(`${GATEWAY_EVENTS_URL}/events?token=${encodeURIComponent(token)}`)
      source = es

      es.onopen = () => {
        hasConnectedOnce = true
        backoff = 1000
        setStatus("live")
        revalidate()
      }
      es.addEventListener("thread", revalidate)
      es.onerror = () => {
        es.close()
        if (source === es) source = null
        scheduleReconnect()
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") revalidate()
    }
    document.addEventListener("visibilitychange", onVisible)

    void connect()

    return () => {
      closed = true
      document.removeEventListener("visibilitychange", onVisible)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      source?.close()
    }
  }, [mutate])

  return (
    <RealtimeConnectionProvider status={status}>
      {children ?? null}
    </RealtimeConnectionProvider>
  )
}
