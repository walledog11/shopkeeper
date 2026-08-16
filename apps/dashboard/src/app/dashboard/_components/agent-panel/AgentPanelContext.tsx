"use client"

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import type { AgentChatState } from "@/components/agent/useAgentChatState"
import { useAgentChatState } from "@/components/agent/useAgentChatState"
import { isDashboardHome, type AgentPanelOpenContext } from "@/lib/agent/panel"

interface AgentPanelContextValue {
  isExpanded: boolean
  openContext: AgentPanelOpenContext | null
  chatState: AgentChatState
  searchInputRef: React.RefObject<HTMLInputElement | null>
  open: (context?: AgentPanelOpenContext) => void
  close: () => void
  expand: () => void
  startFreshConversation: () => void
  focusSearch: () => void
  toggle: () => void
}

const AgentPanelContext = createContext<AgentPanelContextValue | null>(null)

export function AgentPanelProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(false)
  const [openContext, setOpenContext] = useState<AgentPanelOpenContext | null>(null)
  const chatState = useAgentChatState({ restoreHistory: false })
  const searchInputRef = useRef<HTMLInputElement>(null)
  const prevPathnameRef = useRef(pathname)
  const clearPanelRef = useRef(chatState.handleClearPanel)
  clearPanelRef.current = chatState.handleClearPanel

  const expand = useCallback(() => {
    setIsExpanded(true)
  }, [])

  const startFreshConversation = useCallback(() => {
    clearPanelRef.current()
    setOpenContext(null)
  }, [])

  const close = useCallback(() => {
    setIsExpanded(false)
    setOpenContext(null)
  }, [])

  const open = useCallback((context?: AgentPanelOpenContext) => {
    if (context?.walkthrough || context?.threadId) {
      clearPanelRef.current()
    }
    setOpenContext(context ?? null)
    setIsExpanded(true)
  }, [])

  const focusSearch = useCallback(() => {
    if (isExpanded) {
      chatState.textareaRef.current?.focus()
      return
    }
    searchInputRef.current?.focus()
  }, [chatState.textareaRef, isExpanded])

  const toggle = useCallback(() => {
    if (isExpanded) {
      close()
      return
    }
    focusSearch()
  }, [close, focusSearch, isExpanded])

  useEffect(() => {
    const previous = prevPathnameRef.current
    prevPathnameRef.current = pathname
    if (isDashboardHome(pathname) && !isDashboardHome(previous)) {
      clearPanelRef.current()
    }
  }, [pathname])

  useEffect(() => {
    if (!isExpanded) return
    const id = requestAnimationFrame(() => {
      chatState.textareaRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [isExpanded, chatState.textareaRef])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [toggle])

  const value = useMemo(
    () => ({
      isExpanded,
      openContext,
      chatState,
      searchInputRef,
      open,
      close,
      expand,
      startFreshConversation,
      focusSearch,
      toggle,
    }),
    [chatState, close, expand, focusSearch, isExpanded, open, openContext, startFreshConversation, toggle],
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
