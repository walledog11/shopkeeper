"use client"

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import type { AgentChatState } from "@/components/agent/useAgentChatState"
import { useAgentChatState } from "@/components/agent/useAgentChatState"
import { isDashboardHome, type AgentPanelOpenContext } from "@/lib/agent/panel"

interface AgentPanelContextValue {
  isOpen: boolean
  openContext: AgentPanelOpenContext | null
  chatState: AgentChatState
  open: (context?: AgentPanelOpenContext) => void
  close: () => void
  toggle: () => void
}

const AgentPanelContext = createContext<AgentPanelContextValue | null>(null)

export function AgentPanelProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [openContext, setOpenContext] = useState<AgentPanelOpenContext | null>(null)
  const chatState = useAgentChatState({ restoreHistory: false })
  const prevPathnameRef = useRef(pathname)
  const clearPanelRef = useRef(chatState.handleClearPanel)
  clearPanelRef.current = chatState.handleClearPanel

  const open = useCallback((context?: AgentPanelOpenContext) => {
    if (context?.walkthrough || context?.threadId) {
      clearPanelRef.current()
    }
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

  useEffect(() => {
    const previous = prevPathnameRef.current
    prevPathnameRef.current = pathname
    if (isDashboardHome(pathname) && !isDashboardHome(previous)) {
      clearPanelRef.current()
    }
  }, [pathname])

  const value = useMemo(
    () => ({ isOpen, openContext, chatState, open, close, toggle }),
    [chatState, close, isOpen, open, openContext, toggle],
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
