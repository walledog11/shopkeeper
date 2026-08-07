import * as React from "react"

const MOBILE_BREAKPOINT = 768

// The server snapshot is `false` — it cannot know the viewport, so server-rendered
// markup is always desktop-shaped. That is safe today only because every caller
// that branches on this *in markup* renders behind a client fetch. Before seeding a
// page from the server that branches on this hook, decide the split at that call
// site (CSS breakpoints, or a UA hint) rather than letting phones hydrate into a
// desktop layout and flip.
export function useIsMobile() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {}
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      const onChange = () => onStoreChange()
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}
