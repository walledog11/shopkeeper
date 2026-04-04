"use client"

import { useState } from "react"
import { Activity, Bot, MessageSquare, Settings } from "lucide-react"
import Link from "next/link"
import AgentChatClient from "./AgentChatClient"
import ActionLog from "./ActionLog"

type Tab = "chat" | "activity"

interface Props {
  agentName: string
}

export default function AgentPageClient({ agentName }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("chat")

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "activity", label: "Activity", icon: Activity },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden bg-dashboard-bg">

      {/* Page header + tab bar */}
      <div className="shrink-0 bg-white border-b border-slate-200">
        <div className="px-5 md:px-6 flex items-center justify-between pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center shadow-sm">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{agentName}</h1>
              <p className="text-sm text-slate-400">AI operations agent</p>
            </div>
          </div>
          <Link
            href="/dashboard/settings?tab=agent"
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-md transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </Link>
        </div>
        <div className="px-5 md:px-6 flex">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === id
                  ? "border-violet-600 text-violet-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">

        {/* Chat tab — always mounted to preserve session state */}
        <div className={`flex flex-col h-full ${activeTab !== "chat" ? "hidden" : ""}`}>
          <div className="flex-1 min-h-0 mx-5 md:mx-6 my-4 bg-white border border-slate-200 rounded-md shadow-md overflow-hidden">
            <AgentChatClient agentName={agentName} hideHeader />
          </div>
        </div>

        {/* Activity tab */}
        {activeTab === "activity" && (
          <div className="h-full overflow-y-auto">
            <ActionLog />
          </div>
        )}

      </div>


    </div>
  )
}

