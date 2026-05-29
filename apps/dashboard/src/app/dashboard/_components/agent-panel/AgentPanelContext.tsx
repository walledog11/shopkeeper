"use client"

import { createContext, use, useCallback, useMemo, useState } from "react"

interface AgentPanelContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const AgentPanelContext = createContext<AgentPanelContextValue | null>(null)

export function AgentPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(o => !o), [])
  const value = useMemo(() => ({ isOpen, open, close, toggle }), [close, isOpen, open, toggle])

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
