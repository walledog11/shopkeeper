"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Bot } from "lucide-react"
import AgentChatClient from "../../agent/AgentChatClient"

interface Props {
  agentName: string
}

export default function AgentPanelRoot({ agentName }: Props) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Slide-in panel — fixed overlay from the right edge */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="agent-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 35 }}
            className="fixed top-0 right-0 h-full z-40 w-[420px] bg-white border-l border-slate-200 shadow-xl flex flex-col"
          >
            <AgentChatClient agentName={agentName} compact onClose={() => setIsOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating action button — hidden when panel is open */}
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
            onClick={() => setIsOpen(true)}
            title="Open AI Agent"
            className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-violet-600 text-white shadow-lg flex items-center justify-center"
          >
            <Bot className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  )
}
