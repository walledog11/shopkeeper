"use client"

import { useEffect, useState, type RefObject } from "react"

const MOBILE_QUERY = "(max-width: 767px)"
const COARSE_POINTER_QUERY = "(pointer: coarse)"
const KEYBOARD_DELTA_THRESHOLD = 80
const EDITABLE_SELECTOR = [
  "textarea",
  "select",
  "input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='reset'])",
  "[contenteditable='true']",
  "[role='textbox']",
].join(",")

export interface VisualKeyboardState {
  keyboardInset: number
  keyboardOpen: boolean
  visualViewportHeight: number
}

interface VisualKeyboardSnapshotInput {
  focusedEditable: boolean
  innerHeight: number
  isMobile: boolean
  isCoarsePointer?: boolean
  visualViewport?: {
    height: number
    offsetTop: number
  } | null
}

type MediaQueryListWithLegacyListeners = MediaQueryList & {
  addListener?: (listener: () => void) => void
  removeListener?: (listener: () => void) => void
}

const DEFAULT_STATE: VisualKeyboardState = {
  keyboardInset: 0,
  keyboardOpen: false,
  visualViewportHeight: 0,
}

export function getVisualKeyboardState({
  focusedEditable,
  innerHeight,
  isMobile,
  isCoarsePointer = false,
  visualViewport,
}: VisualKeyboardSnapshotInput): VisualKeyboardState {
  const hasVisualViewport = !!visualViewport
  const visualViewportHeight = visualViewport?.height ?? innerHeight
  const viewportDelta = hasVisualViewport ? innerHeight - visualViewportHeight : 0
  const viewportWasReduced = viewportDelta > KEYBOARD_DELTA_THRESHOLD
  const focusFallback = !hasVisualViewport && focusedEditable && isCoarsePointer
  const keyboardOpen = isMobile && (viewportWasReduced || focusFallback)
  const keyboardInset = keyboardOpen && visualViewport
    ? Math.max(0, innerHeight - visualViewport.height - visualViewport.offsetTop)
    : 0

  return {
    keyboardInset,
    keyboardOpen,
    visualViewportHeight,
  }
}

function statesMatch(a: VisualKeyboardState, b: VisualKeyboardState) {
  return a.keyboardInset === b.keyboardInset &&
    a.keyboardOpen === b.keyboardOpen &&
    a.visualViewportHeight === b.visualViewportHeight
}

export function useVisualKeyboard(rootRef: RefObject<HTMLElement | null>, enabled = true) {
  const [state, setState] = useState<VisualKeyboardState>(DEFAULT_STATE)

  useEffect(() => {
    if (!enabled) {
      setState(DEFAULT_STATE)
      return
    }
    if (typeof window === "undefined") return

    let settleTimer: ReturnType<typeof setTimeout> | null = null
    const mobileQuery = window.matchMedia(MOBILE_QUERY)
    const legacyMobileQuery = mobileQuery as MediaQueryListWithLegacyListeners
    const coarsePointerQuery = window.matchMedia(COARSE_POINTER_QUERY)
    const legacyCoarsePointerQuery = coarsePointerQuery as MediaQueryListWithLegacyListeners

    const hasFocusedEditable = () => {
      const activeElement = document.activeElement
      const root = rootRef.current

      return activeElement instanceof HTMLElement &&
        !!root &&
        root.contains(activeElement) &&
        activeElement.matches(EDITABLE_SELECTOR)
    }

    const read = () => getVisualKeyboardState({
      focusedEditable: hasFocusedEditable(),
      innerHeight: window.innerHeight,
      isMobile: mobileQuery.matches,
      isCoarsePointer: coarsePointerQuery.matches,
      visualViewport: window.visualViewport
        ? {
            height: window.visualViewport.height,
            offsetTop: window.visualViewport.offsetTop,
          }
        : null,
    })

    const update = () => {
      const next = read()
      setState(current => statesMatch(current, next) ? current : next)
    }

    const scheduleUpdate = () => {
      update()
      if (settleTimer) clearTimeout(settleTimer)
      settleTimer = setTimeout(update, 250)
    }

    scheduleUpdate()

    window.visualViewport?.addEventListener("resize", scheduleUpdate)
    window.visualViewport?.addEventListener("scroll", scheduleUpdate)
    window.addEventListener("resize", scheduleUpdate)
    window.addEventListener("focusin", scheduleUpdate)
    window.addEventListener("focusout", scheduleUpdate)
    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", scheduleUpdate)
    } else {
      legacyMobileQuery.addListener?.(scheduleUpdate)
    }
    if (typeof coarsePointerQuery.addEventListener === "function") {
      coarsePointerQuery.addEventListener("change", scheduleUpdate)
    } else {
      legacyCoarsePointerQuery.addListener?.(scheduleUpdate)
    }

    return () => {
      if (settleTimer) clearTimeout(settleTimer)
      window.visualViewport?.removeEventListener("resize", scheduleUpdate)
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate)
      window.removeEventListener("resize", scheduleUpdate)
      window.removeEventListener("focusin", scheduleUpdate)
      window.removeEventListener("focusout", scheduleUpdate)
      if (typeof mobileQuery.removeEventListener === "function") {
        mobileQuery.removeEventListener("change", scheduleUpdate)
      } else {
        legacyMobileQuery.removeListener?.(scheduleUpdate)
      }
      if (typeof coarsePointerQuery.removeEventListener === "function") {
        coarsePointerQuery.removeEventListener("change", scheduleUpdate)
      } else {
        legacyCoarsePointerQuery.removeListener?.(scheduleUpdate)
      }
    }
  }, [enabled, rootRef])

  return state
}
