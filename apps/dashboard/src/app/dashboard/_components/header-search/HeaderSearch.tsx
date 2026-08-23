"use client"

import { Search } from "lucide-react"
import { useCallback, useEffect, useState, type KeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { usePathname, useRouter } from "next/navigation"
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react"
import AgentChatClient from "@/components/agent/AgentChatClient"
import { cn } from "@/lib/ui/cn"
import { matchConciergeNavigationIntent } from "@/lib/agent/concierge-navigation"
import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { GLASS_PILL_SURFACE } from "@/lib/ui/glass-card-styles"
import { useAgentPanel } from "../agent-panel/AgentPanelContext"
import {
  desktopTopBarUtilityPillClass,
  dispatchNavProgressStart,
  topBarIconButtonClass,
} from "../sidebar/sidebar-helpers"

const headerSearchShellBase = cn("rounded-xl", GLASS_PILL_SURFACE)

const headerSearchExpandedShellClass = cn(
  headerSearchShellBase,
  "shadow-[0_16px_48px_rgba(43,33,24,0.18)]",
)

interface HeaderSearchProps {
  variant?: "topBar" | "mobile"
}

export function HeaderSearch({ variant = "topBar" }: HeaderSearchProps) {
  const {
    isExpanded,
    openContext,
    chatState,
    searchInputRef,
    close,
    expand,
    startFreshConversation,
  } = useAgentPanel()
  const router = useRouter()
  const pathname = usePathname()
  const isMobile = variant === "mobile"
  const { input, setInput, isRunning, handleSendText } = chatState
  const [portalReady, setPortalReady] = useState(false)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  const handleCollapsedSubmit = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isRunning) return

    const navIntent = matchConciergeNavigationIntent(trimmed)
    if (navIntent) {
      if (navIntent.href !== pathname) {
        router.prefetch(navIntent.href)
        dispatchNavProgressStart()
        router.push(navIntent.href)
      }
      setInput("")
      return
    }

    startFreshConversation()
    setInput("")
    expand()
    await handleSendText(trimmed)
  }, [expand, handleSendText, input, isRunning, pathname, router, setInput, startFreshConversation])

  const handleCollapsedKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      void handleCollapsedSubmit()
    }
  }, [handleCollapsedSubmit])

  if (isMobile) {
    const mobileOverlay = portalReady
      ? createPortal(
        <LazyMotion features={domAnimation}>
          <AnimatePresence>
            {isExpanded && (
              <m.div
                key="header-search-mobile"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[60] flex flex-col bg-sidebar md:hidden"
              >
                <div className="min-h-0 flex-1">
                  <AgentChatClient
                    compact
                    embedded
                    headerSearchMode
                    onClose={close}
                    openContext={openContext}
                    state={chatState}
                  />
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </LazyMotion>,
        document.body,
      )
      : null

    return (
      <>
        <button
          type="button"
          onClick={() => expand()}
          aria-label="Search or ask"
          title="Search or ask (⌘K)"
          className={topBarIconButtonClass}
        >
          <Search className="size-5" />
        </button>

        {mobileOverlay}
      </>
    )
  }

  return (
    <LazyMotion features={domAnimation}>
      <div className="relative z-50 h-12 w-full self-start">
        <AnimatePresence>
          {isExpanded && (
            <m.button
              type="button"
              aria-label="Close search"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={close}
              className="fixed inset-0 z-40 bg-foreground/[0.06]"
            />
          )}
        </AnimatePresence>

        <div
          data-dashboard-header-search
          className={cn(
            isExpanded ? headerSearchExpandedShellClass : desktopTopBarUtilityPillClass,
            "z-50 overflow-hidden",
            isExpanded
              ? "absolute inset-x-0 top-0 flex flex-col items-stretch h-[420px] max-h-[75vh]"
              : "relative w-full h-12",
          )}
        >
          {isExpanded ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <AgentChatClient
                compact
                embedded
                headerSearchMode
                onClose={close}
                openContext={openContext}
                state={chatState}
              />
            </div>
          ) : (
            <div className="flex h-12 w-full min-w-0 items-center gap-2 px-4">
              <Search className="size-4 shrink-0 text-sidebar-foreground/50" />
              <input
                ref={searchInputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleCollapsedKeyDown}
                placeholder={`Search or ask ${AGENT_DISPLAY_NAME}…`}
                aria-label="Search or ask"
                className="min-w-0 flex-1 border-0 bg-transparent py-0 text-sm leading-5 text-sidebar-foreground placeholder:text-sidebar-foreground/45 outline-none"
              />
              <kbd className="hidden xl:inline-flex shrink-0 items-center rounded border border-border/80 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-sidebar-foreground/45">
                ⌘K
              </kbd>
            </div>
          )}
        </div>
      </div>
    </LazyMotion>
  )
}