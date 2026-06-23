import { useEffect, type RefObject } from "react"
import { useMobileChromeOverride } from "@/app/dashboard/_components/mobile-chrome/MobileChromeContext"

interface UseConversationViewportEffectsOptions {
  activeTab: "open" | "closed"
  composerRef: RefObject<HTMLDivElement | null>
  conversationRef: RefObject<HTMLDivElement | null>
  displayMessageCount: number
  failedMessageCount: number
  isMobile: boolean
  keyboardInset: number
  keyboardLayoutOpen: boolean
  replyText: string
  scrollTimelineToEnd: (behavior?: ScrollBehavior) => void
  viewTab: "chat" | "notes"
  visualViewportHeight: number
}

export function useConversationViewportEffects({
  activeTab,
  composerRef,
  conversationRef,
  displayMessageCount,
  failedMessageCount,
  isMobile,
  keyboardInset,
  keyboardLayoutOpen,
  replyText,
  scrollTimelineToEnd,
  viewTab,
  visualViewportHeight,
}: UseConversationViewportEffectsOptions) {
  useMobileChromeOverride(
    isMobile ? (keyboardLayoutOpen ? "immersive" : "detail") : null,
  )

  useEffect(() => {
    const root = conversationRef.current
    if (activeTab !== "open") {
      root?.style.setProperty("--ticket-composer-height", "0px")
      return
    }

    const element = composerRef.current
    if (!element) return

    const updateHeight = () => {
      root?.style.setProperty("--ticket-composer-height", `${Math.ceil(element.getBoundingClientRect().height)}px`)
    }

    updateHeight()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeight)
      return () => window.removeEventListener("resize", updateHeight)
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)

    return () => observer.disconnect()
  }, [activeTab, composerRef, conversationRef])

  useEffect(() => {
    if (!keyboardLayoutOpen) return

    const settleScroll = () => scrollTimelineToEnd("smooth")
    const first = window.setTimeout(settleScroll, 50)
    const second = window.setTimeout(settleScroll, 300)

    return () => {
      window.clearTimeout(first)
      window.clearTimeout(second)
    }
  }, [
    displayMessageCount,
    failedMessageCount,
    keyboardInset,
    keyboardLayoutOpen,
    replyText,
    scrollTimelineToEnd,
    viewTab,
    visualViewportHeight,
  ])
}
