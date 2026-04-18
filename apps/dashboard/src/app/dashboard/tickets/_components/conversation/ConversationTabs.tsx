"use client"

import { MessageSquare, Users } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface Props {
  noteCount: number
  value: "chat" | "notes"
  onValueChange: (value: "chat" | "notes") => void
}

export default function ConversationTabs({ noteCount, value, onValueChange }: Props) {
  return (
    <div className="px-4 py-2 border-b border-border bg-background shrink-0">
      <Tabs value={value} onValueChange={(nextValue) => onValueChange(nextValue as "chat" | "notes")}>
        <TabsList className="bg-transparent h-auto p-0 gap-1">
          <TabsTrigger
            value="chat"
            className="text-xs font-semibold rounded px-3 py-1.5 gap-1.5 h-auto data-[state=active]:bg-white/[0.10] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-white/35"
          >
            <MessageSquare className="w-3 h-3" />
            Conversation
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="text-xs font-semibold rounded px-3 py-1.5 gap-1.5 h-auto data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-400 data-[state=active]:shadow-none data-[state=inactive]:text-white/35"
          >
            <Users className="w-3 h-3" />
            Internal
            {noteCount > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                value === "notes" ? "bg-violet-500/20 text-violet-400" : "bg-white/[0.08] text-white/35"
              }`}>
                {noteCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}
