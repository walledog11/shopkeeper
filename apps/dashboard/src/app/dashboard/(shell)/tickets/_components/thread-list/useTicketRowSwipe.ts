"use client"

import { useEffect, useRef, type CSSProperties, type MouseEvent, type PointerEvent } from "react"

const SWIPE_DETECT_PX = 8
const SWIPE_COMMIT_PX = 120
const CLICK_SUPPRESS_PX = 6

export type TicketRowSwipeAction = { kind: "recover" | "spam"; run: () => void }

interface UseTicketRowSwipeParams {
  enabled: boolean
  action: TicketRowSwipeAction | null
  onOpen: () => void
}

export function useTicketRowSwipe({ enabled, action, onOpen }: UseTicketRowSwipeParams) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  const swipe = useRef({
    pointerId: -1, startX: 0, startY: 0, dx: 0,
    locked: false, width: 0, suppressClick: false, committed: false,
  })
  const commitTimeout = useRef<number | null>(null)
  const settleTimeout = useRef<number | null>(null)

  const canSwipe = enabled && action !== null

  useEffect(() => () => {
    if (commitTimeout.current !== null) window.clearTimeout(commitTimeout.current)
    if (settleTimeout.current !== null) window.clearTimeout(settleTimeout.current)
  }, [])

  function applyTransform(tx: number, animate: boolean) {
    const el = surfaceRef.current
    if (!el) return
    el.style.transition = animate ? "transform 180ms ease" : "none"
    el.style.transform = tx === 0 ? "" : `translate3d(${tx}px,0,0)`
  }

  function setBannerVisible(visible: boolean) {
    const el = bannerRef.current
    if (!el) return
    el.style.visibility = visible ? "visible" : "hidden"
  }

  function setSurfacePromoted(promoted: boolean) {
    const el = surfaceRef.current
    if (!el) return
    el.style.willChange = promoted ? "transform" : ""
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!canSwipe) return
    if (event.pointerType === "mouse" && event.button !== 0) return
    if (swipe.current.pointerId !== -1) return
    if (swipe.current.committed) return
    if (settleTimeout.current !== null) {
      window.clearTimeout(settleTimeout.current)
      settleTimeout.current = null
    }
    swipe.current = {
      pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      dx: 0, locked: false,
      width: event.currentTarget.getBoundingClientRect().width,
      suppressClick: false, committed: false,
    }
    setSurfacePromoted(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const s = swipe.current
    if (s.pointerId !== event.pointerId) return
    const dx = event.clientX - s.startX
    const dy = event.clientY - s.startY
    if (!s.locked) {
      if (Math.abs(dx) < SWIPE_DETECT_PX && Math.abs(dy) < SWIPE_DETECT_PX) return
      if (Math.abs(dy) > Math.abs(dx)) {
        s.pointerId = -1
        setSurfacePromoted(false)
        return
      }
      s.locked = true
      setBannerVisible(true)
    }
    s.dx = Math.min(0, dx)
    if (Math.abs(s.dx) > CLICK_SUPPRESS_PX) s.suppressClick = true
    applyTransform(s.dx, false)
  }

  function finish(event: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const s = swipe.current
    if (s.pointerId !== event.pointerId) return
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    s.pointerId = -1
    const commitPx = Math.min(SWIPE_COMMIT_PX, s.width * 0.4)
    if (!cancelled && s.locked && action && s.dx <= -commitPx) {
      s.committed = true
      applyTransform(-s.width, true)
      commitTimeout.current = window.setTimeout(() => {
        commitTimeout.current = null
        action.run()
      }, 180)
    } else {
      applyTransform(0, true)
      const wasLocked = s.locked
      s.locked = false
      settleTimeout.current = window.setTimeout(() => {
        settleTimeout.current = null
        if (swipe.current.pointerId !== -1 || swipe.current.committed) return
        if (wasLocked) setBannerVisible(false)
        setSurfacePromoted(false)
      }, 200)
    }
  }

  function openTicketRow(event: MouseEvent) {
    if (swipe.current.suppressClick || swipe.current.committed) {
      swipe.current.suppressClick = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onOpen()
  }

  const style: CSSProperties | undefined = canSwipe ? { touchAction: "pan-y" } : undefined

  return {
    bannerRef,
    canSwipe,
    openTicketRow,
    surfaceProps: {
      ref: surfaceRef,
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => finish(event, false),
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
      style,
    },
  }
}
