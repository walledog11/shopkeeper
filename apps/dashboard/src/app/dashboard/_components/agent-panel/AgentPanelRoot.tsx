"use client"

import * as React from "react"
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react"
import type { AutonomyTier } from "@shopkeeper/agent/settings"
import AgentChatClient from "@/components/agent/AgentChatClient"
import { useAgentPanel } from "./AgentPanelContext"

interface Props {
  agentName: string
  autonomyTier: AutonomyTier
}

export default function AgentPanelRoot({ agentName, autonomyTier }: Props) {
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
              className="fixed inset-0 z-50 bg-background flex flex-col"
            >
              <AgentChatClient
                agentName={agentName}
                autonomyTier={autonomyTier}
                compact
                openContext={openContext}
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
              className="flex-shrink-0 overflow-hidden h-full bg-background border-l border-border shadow-xl flex flex-col"
            >
              <div className="w-[420px] h-full flex flex-col">
                <AgentChatClient
                  agentName={agentName}
                  autonomyTier={autonomyTier}
                  compact
                  openContext={openContext}
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
