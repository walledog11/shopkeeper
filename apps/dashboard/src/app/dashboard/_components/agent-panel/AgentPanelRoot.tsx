"use client"

import * as React from "react"
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react"
import AgentChatClient from "@/components/agent/AgentChatClient"
import { useAgentPanel } from "./AgentPanelContext"

interface Props {
  agentName: string
}

export default function AgentPanelRoot({ agentName }: Props) {
  const { isOpen, openContext, close } = useAgentPanel()
  const isLargeScreen = React.useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {}
      const mql = window.matchMedia("(min-width: 1024px)")
      const onChange = () => onStoreChange()
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  )

  const isMobile = !isLargeScreen

  return (
    <LazyMotion features={domAnimation}>
      {/* Slide-in panel */}
      <AnimatePresence>
        {isOpen && (
          isMobile ? (
            <m.div
              key="agent-panel-mobile"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 300, damping: 35 }}
              className="fixed inset-0 z-50 flex w-full max-w-full flex-col overflow-hidden bg-background"
            >
              <AgentChatClient
                agentName={agentName}
                compact
                openContext={openContext}
                restoreSession={!openContext?.walkthrough}
                onClose={close}
              />
            </m.div>
          ) : (
            <m.div
              key="agent-panel-desktop"
              initial={{ width: 0 }}
              animate={{ width: 420 }}
              exit={{ width: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 35 }}
              className="flex h-full min-w-0 flex-shrink-0 flex-col overflow-hidden border-l border-border bg-background shadow-xl"
            >
              <div className="flex h-full w-full min-w-0 flex-col">
                <AgentChatClient
                  agentName={agentName}
                  compact
                  openContext={openContext}
                  restoreSession={!openContext?.walkthrough}
                  onClose={close}
                />
              </div>
            </m.div>
          )
        )}
      </AnimatePresence>
    </LazyMotion>
  )
}
