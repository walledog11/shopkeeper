"use client"

import { useState } from "react"
import { Activity, Plus, X } from "lucide-react"
import AgentChatClient from "@/components/agent/AgentChatClient"
import ActionLog from "./ActionLog"

interface Props {
  agentName: string
}

export default function AgentPageClient({ agentName }: Props) {
  const [showActivity, setShowActivity] = useState(false)
  const [sessionResetKey, setSessionResetKey] = useState(0)

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-5 md:px-6 py-3.5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-foreground">Concierge</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            Direct line to your AI — ask about the store, draft campaigns, pull data.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Activity log toggle — mobile only */}
          <button
            onClick={() => setShowActivity(v => !v)}
            className={`flex md:hidden items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
              showActivity
                ? "border-violet-500/50 text-violet-400 bg-violet-500/10"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Activity className="w-3 h-3" />
            Activity log
          </button>
          <button
            onClick={() => setSessionResetKey(k => k + 1)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3 h-3" />
            New session
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-row relative">
        {/* Chat — always visible */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <AgentChatClient agentName={agentName} hideHeader sessionResetKey={sessionResetKey} />
        </div>

        {/* Desktop sidebar — always visible */}
        <div className="hidden md:flex w-100 shrink-0 border-l border-border overflow-y-auto flex-col">
          <div className="sticky top-0 px-4 py-3 border-b border-border bg-background">
            <p className="text-xs font-medium text-foreground">Activity log</p>
          </div>
          <ActionLog sidebarLimit={999} />
        </div>

        {/* Mobile dropdown — full overlay over chat, below header */}
        {showActivity && (
          <div className="md:hidden absolute inset-0 z-10 bg-background flex flex-col overflow-hidden">
            <div className="shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="text-xs font-medium text-foreground">Activity log</p>
              <button
                onClick={() => setShowActivity(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ActionLog sidebarLimit={999} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
