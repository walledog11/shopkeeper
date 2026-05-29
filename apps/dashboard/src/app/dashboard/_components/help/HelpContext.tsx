"use client"

import { createContext, use, useState, useCallback, useMemo, type ReactNode } from "react"

interface HelpContextValue {
  isOpen: boolean
  openHelp: () => void
  closeHelp: () => void
}

const HelpContext = createContext<HelpContextValue | null>(null)

export function HelpProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const openHelp = useCallback(() => setIsOpen(true), [])
  const closeHelp = useCallback(() => setIsOpen(false), [])
  const value = useMemo(() => ({ isOpen, openHelp, closeHelp }), [closeHelp, isOpen, openHelp])

  return (
    <HelpContext.Provider value={value}>
      {children}
    </HelpContext.Provider>
  )
}

export function useHelp() {
  const ctx = use(HelpContext)
  if (!ctx) throw new Error("useHelp must be used within HelpProvider")
  return ctx
}
