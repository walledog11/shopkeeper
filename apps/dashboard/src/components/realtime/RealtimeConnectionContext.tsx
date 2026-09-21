"use client"

import { createContext, useContext, type ReactNode } from "react"

export type RealtimeConnectionStatus = "disabled" | "connecting" | "live" | "reconnecting"

const RealtimeConnectionContext = createContext<RealtimeConnectionStatus>("disabled")

export function RealtimeConnectionProvider({
  status,
  children,
}: {
  status: RealtimeConnectionStatus
  children: ReactNode
}) {
  return (
    <RealtimeConnectionContext.Provider value={status}>
      {children}
    </RealtimeConnectionContext.Provider>
  )
}

export function useRealtimeConnectionStatus(): RealtimeConnectionStatus {
  return useContext(RealtimeConnectionContext)
}
