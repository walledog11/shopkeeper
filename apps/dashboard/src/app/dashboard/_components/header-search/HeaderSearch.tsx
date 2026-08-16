"use client"

import { Search, X } from "lucide-react"
import { useCallback, type KeyboardEvent } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react"
import AgentChatClient from "@/components/agent/AgentChatClient"
import { cn } from "@/lib/ui/cn"
import { matchConciergeNavigationIntent } from "@/lib/agent/concierge-navigation"
import { useAgentPanel } from "../agent-panel/AgentPanelContext"
import {
  desktopTopBarUtilityPillClass,
  dispatchNavProgressStart,
} from "../sidebar/sidebar-helpers"

const headerSearchShellBase =
  "rounded-xl border border-border/80 bg-sidebar/95 backdrop-blur-md supports-[backdrop-filter]:bg-sidebar/85"

const headerSearchExpandedShellClass = cn(
  headerSearchShellBase,
  "shadow-[0_16px_48px_rgba(43,33,24,0.18)]",
)

interface HeaderSearchProps {
  agentName: string
  variant?: "topBar" | "mobile"
}

export function HeaderSearch({ agentName, variant = "topBar" }: HeaderSearchProps) {
  const {
    isExpanded,
    openContext,
    chatState,
    searchInputRef,
    close,
    expand,
  } = useAgentPanel()
  const router = useRouter()
  const pathname = usePathname()
  const isMobile = variant === "mobile"
  const { input, setInput, isRunning, handleSendText } = chatState

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

    setInput("")
    expand()
    await handleSendText(trimmed)
  }, [expand, handleSendText, input, isRunning, pathname, router, setInput])

  const handleCollapsedKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      void handleCollapsedSubmit()
    }
  }, [handleCollapsedSubmit])

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => expand()}
          aria-label="Search or ask"
          title="Search or ask (⌘K)"
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08] transition-colors"
        >
          <Search className="size-5" />
        </button>

        <LazyMotion features={domAnimation}>
          <AnimatePresence>
            {isExpanded && (
              <m.div
                key="header-search-mobile"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 flex flex-col bg-sidebar md:hidden"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 h-14">
                  <span className="text-sm font-semibold text-sidebar-foreground">{agentName}</span>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close search"
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1">
                  <AgentChatClient
                    agentName={agentName}
                    compact
                    embedded
                    headerSearchMode
                    openContext={openContext}
                    state={chatState}
                  />
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </LazyMotion>
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

        <header
          data-dashboard-header-search
          className={cn(
            isExpanded ? headerSearchExpandedShellClass : desktopTopBarUtilityPillClass,
            "z-50 flex flex-col overflow-hidden",
            isExpanded
              ? "absolute inset-x-0 top-0 h-[420px] max-h-[75vh]"
              : "relative w-full h-12",
          )}
        >
          {isExpanded ? (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 h-12">
                <Search className="size-4 shrink-0 text-sidebar-foreground/50" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-sidebar-foreground">
                  {agentName}
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close search"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
                <AgentChatClient
                  agentName={agentName}
                  compact
                  embedded
                  headerSearchMode
                  openContext={openContext}
                  state={chatState}
                />
              </div>
            </>
          ) : (
            <div className="flex h-12 items-center gap-2 px-4">
              <Search className="size-4 shrink-0 text-sidebar-foreground/50" />
              <input
                ref={searchInputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleCollapsedKeyDown}
                placeholder={`Search or ask ${agentName}…`}
                aria-label="Search or ask"
                className="min-w-0 flex-1 bg-transparent text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/45 outline-none"
              />
              <kbd className="hidden xl:inline-flex shrink-0 items-center rounded border border-border/80 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-sidebar-foreground/45">
                ⌘K
              </kbd>
            </div>
          )}
        </header>
      </div>
    </LazyMotion>
  )
}