"use client"

import { createContext, use, useState, useCallback, useMemo, type ReactNode } from "react"

interface HelpContextValue {
  isOpen: boolean
  openHelp: () => void
  closeHelp: () => void
  toggleHelp: () => void
}

const HelpContext = createContext<HelpContextValue | null>(null)

export function HelpProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const openHelp = useCallback(() => setIsOpen(true), [])
  const closeHelp = useCallback(() => setIsOpen(false), [])
  const toggleHelp = useCallback(() => setIsOpen(v => !v), [])
  const value = useMemo(
    () => ({ isOpen, openHelp, closeHelp, toggleHelp }),
    [closeHelp, isOpen, openHelp, toggleHelp],
  )

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
