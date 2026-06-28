"use client"

import { useEffect } from "react"
import { useSWRConfig } from "swr"
import { GATEWAY_EVENTS_URL, REALTIME_ENABLED } from "@/lib/realtime/config"

// Keys whose data reflects inbound thread activity. A pushed event just says
// "something changed" — we revalidate these through SWR's normal authenticated
// fetch rather than trusting any payload.
function shouldRevalidate(key: unknown): boolean {
  return typeof key === "string"
    && (key.startsWith("/api/threads") || key === "/api/home-summary")
}

// One EventSource per tab. Bridges gateway-published thread events into SWR cache
// revalidation; reconnects with backoff and a fresh token; catches up on focus.
export default function RealtimeProvider() {
  const { mutate } = useSWRConfig()

  useEffect(() => {
    if (!REALTIME_ENABLED) return
    if (typeof window === "undefined" || typeof EventSource === "undefined") return

    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let backoff = 1000
    let closed = false

    const revalidate = () => { void mutate(shouldRevalidate) }

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        void connect()
      }, backoff)
      backoff = Math.min(backoff * 2, 30_000)
    }

    async function connect() {
      if (closed) return

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
        backoff = 1000
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

  return null
}
