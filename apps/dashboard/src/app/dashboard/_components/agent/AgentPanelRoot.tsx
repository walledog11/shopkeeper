"use client"

import { motion, AnimatePresence } from "motion/react"
import { Bot } from "lucide-react"
import AgentChatClient from "../../agent/AgentChatClient"
import { useAgentPanel } from "./AgentPanelContext"

interface Props {
  agentName: string
}

export default function AgentPanelRoot({ agentName }: Props) {
  const { isOpen, open, close } = useAgentPanel()

  return (
    <>
      {/* Slide-in panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="agent-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 35 }}
            className="fixed top-0 right-0 h-full z-50 w-full md:w-[420px] bg-background border-l border-border shadow-xl flex flex-col"
          >
            <AgentChatClient agentName={agentName} compact onClose={close} />
          </motion.div>
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
            className="hidden md:flex fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-violet-600 text-white shadow-lg items-center justify-center"
          >
            <Bot className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  )
}
