"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

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

  return (
    <HelpContext.Provider value={{ isOpen, openHelp, closeHelp }}>
      {children}
    </HelpContext.Provider>
  )
}

export function useHelp() {
  const ctx = useContext(HelpContext)
  if (!ctx) throw new Error("useHelp must be used within HelpProvider")
  return ctx
}
