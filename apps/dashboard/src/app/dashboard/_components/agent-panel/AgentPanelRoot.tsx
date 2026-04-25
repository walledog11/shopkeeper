"use client"

import * as React from "react"
import { motion, AnimatePresence } from "motion/react"
import { Ghost } from "lucide-react"
import AgentChatClient from "@/components/agent/AgentChatClient"
import { useAgentPanel } from "./AgentPanelContext"

interface Props {
  agentName: string
}

export default function AgentPanelRoot({ agentName }: Props) {
  const { isOpen, open, close } = useAgentPanel()
  const [isLargeScreen, setIsLargeScreen] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)")
    const onChange = () => setIsLargeScreen(mql.matches)
    mql.addEventListener("change", onChange)
    setIsLargeScreen(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  const isMobile = !isLargeScreen

  return (
    <>
      {/* Slide-in panel */}
      <AnimatePresence>
        {isOpen && (
          isMobile ? (
            <motion.div
              key="agent-panel-mobile"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 300, damping: 35 }}
              className="fixed inset-0 z-50 bg-background flex flex-col"
            >
              <AgentChatClient agentName={agentName} compact onClose={close} />
            </motion.div>
          ) : (
            <motion.div
              key="agent-panel-desktop"
              initial={{ width: 0 }}
              animate={{ width: 420 }}
              exit={{ width: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 35 }}
              className="flex-shrink-0 overflow-hidden h-full bg-background border-l border-border shadow-xl flex flex-col"
            >
              <div className="w-[420px] h-full flex flex-col">
                <AgentChatClient agentName={agentName} compact onClose={close} />
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>

      {/* Desktop FAB — hidden on mobile (mobile uses header button) */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            key="agent-fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={open}
            title="Open AI Agent"
            className="hidden md:flex fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-green-600 text-white shadow-lg items-center justify-center"
          >
            <Ghost className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  )
}
