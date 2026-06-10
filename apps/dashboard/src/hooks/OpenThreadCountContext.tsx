"use client"

import { createContext, use, useCallback, useMemo, useState, type ReactNode } from "react"

interface OpenThreadCountContextValue {
  override: number | null
  setOverride: (count: number | null) => void
}

const OpenThreadCountContext = createContext<OpenThreadCountContextValue | null>(null)

export function OpenThreadCountProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<number | null>(null)
  const setOverride = useCallback((count: number | null) => {
    setOverrideState(count)
  }, [])

  const value = useMemo(
    () => ({ override, setOverride }),
    [override, setOverride],
  )

  return (
    <OpenThreadCountContext.Provider value={value}>
      {children}
    </OpenThreadCountContext.Provider>
  )
}

export function useOpenThreadCountOverride() {
  const ctx = use(OpenThreadCountContext)
  if (!ctx) {
    throw new Error("useOpenThreadCountOverride must be used inside OpenThreadCountProvider")
  }
  return ctx
}
