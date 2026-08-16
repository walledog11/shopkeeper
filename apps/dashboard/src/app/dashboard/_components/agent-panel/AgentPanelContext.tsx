"use client"

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import type { AgentChatState } from "@/components/agent/useAgentChatState"
import { useAgentChatState } from "@/components/agent/useAgentChatState"
import { isDashboardHome, type AgentPanelOpenContext } from "@/lib/agent/panel"
import { useRightRail } from "../right-rail/RightRailContext"

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
  const { isOpen, tab, openTab, close: closeRail } = useRightRail()
  const [openContext, setOpenContext] = useState<AgentPanelOpenContext | null>(null)
  const chatState = useAgentChatState({ restoreHistory: false })
  const prevPathnameRef = useRef(pathname)
  const clearPanelRef = useRef(chatState.handleClearPanel)
  clearPanelRef.current = chatState.handleClearPanel

  const conciergeIsOpen = isOpen && tab === "concierge"

  const open = useCallback((context?: AgentPanelOpenContext) => {
    if (context?.walkthrough || context?.threadId) {
      clearPanelRef.current()
    }
    setOpenContext(context ?? null)
    openTab("concierge")
  }, [openTab])

  const close = useCallback(() => {
    closeRail()
    setOpenContext(null)
  }, [closeRail])

  const toggle = useCallback(() => {
    if (isOpen && tab === "concierge") {
      close()
      return
    }
    open()
  }, [close, isOpen, open, tab])

  useEffect(() => {
    const previous = prevPathnameRef.current
    prevPathnameRef.current = pathname
    if (isDashboardHome(pathname) && !isDashboardHome(previous)) {
      clearPanelRef.current()
    }
  }, [pathname])

  const value = useMemo(
    () => ({ isOpen: conciergeIsOpen, openContext, chatState, open, close, toggle }),
    [chatState, close, conciergeIsOpen, open, openContext, toggle],
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
