"use client"

import { createContext, use, useCallback, useMemo, useState } from "react"
import type { AgentPanelOpenContext } from "@/lib/agent/panel"

interface AgentPanelContextValue {
  isOpen: boolean
  openContext: AgentPanelOpenContext | null
  open: (context?: AgentPanelOpenContext) => void
  close: () => void
  toggle: () => void
}

const AgentPanelContext = createContext<AgentPanelContextValue | null>(null)

export function AgentPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [openContext, setOpenContext] = useState<AgentPanelOpenContext | null>(null)

  const open = useCallback((context?: AgentPanelOpenContext) => {
    setOpenContext(context ?? null)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setOpenContext(null)
  }, [])

  const toggle = useCallback(() => {
    setIsOpen((wasOpen) => {
      if (wasOpen) setOpenContext(null)
      return !wasOpen
    })
  }, [])

  const value = useMemo(
    () => ({ isOpen, openContext, open, close, toggle }),
    [close, isOpen, open, openContext, toggle],
  )

  return (
    <AgentPanelContext.Provider value={value}>
      {children}
    </AgentPanelContext.Provider>
  )
}

export function useAgentPanel() {
  const ctx = use(AgentPanelContext)
  if (!ctx) throw new Error("useAgentPanel must be used inside AgentPanelProvider")
  return ctx
}
