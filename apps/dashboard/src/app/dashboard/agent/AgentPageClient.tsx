"use client"

import { Activity, Bot, MessageSquare, Settings } from "lucide-react"
import Link from "next/link"
import AgentChatClient from "./AgentChatClient"
import ActionLog from "./ActionLog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

interface Props {
  agentName: string
}

export default function AgentPageClient({ agentName }: Props) {
  return (
    <Tabs defaultValue="chat" className="h-full flex flex-col gap-0 overflow-hidden bg-background">

      {/* Page header + tab bar */}
      <div className="shrink-0 border-b border-border">
        <div className="px-5 md:px-6 flex items-center justify-between py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center shadow-sm">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">{agentName}</h1>
          </div>
          <Link
            href="/dashboard/settings?tab=agent"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-border/70 rounded-md transition-colors"
          >
            <Settings className="w-3 h-3" />
            Settings
          </Link>
        </div>
        <TabsList variant="line" className="h-auto px-5 md:px-6 w-full justify-start rounded-none bg-transparent border-0 p-0 gap-1">
          <TabsTrigger value="chat" className="rounded-none px-3 py-2 text-sm">
            <MessageSquare className="w-3.5 h-3.5" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="activity" className="rounded-none px-3 py-2 text-sm">
            <Activity className="w-3.5 h-3.5" />
            Activity
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">

        {/* Chat tab — always mounted to preserve session state */}
        <TabsContent value="chat" forceMount className="h-full flex flex-col data-[state=inactive]:hidden">
          <div className="flex-1 min-h-0 mx-5 md:mx-6 my-4 border border-border rounded-md shadow-sm overflow-hidden">
            <AgentChatClient agentName={agentName} hideHeader />
          </div>
        </TabsContent>

        <TabsContent value="activity" className="h-full overflow-y-auto">
          <ActionLog />
        </TabsContent>

      </div>

    </Tabs>
  )
}
