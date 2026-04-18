"use client"

import { AlertCircle, Bot, Check, RefreshCw, Smartphone, Users } from "lucide-react"
import type { AgentTurn, Ticket } from "@/types"
import { TOOL_LABELS } from "@/lib/agent/tools"

interface Props {
  agentName: string
  agentTurns: AgentTurn[]
  isAgentRunning: boolean
  isPlanLoading: boolean
  pendingInstruction: string | null
  planPhrase: string
  runPhrase: string
  messages: Ticket["messages"]
}

export default function NotesTimeline({
  agentName,
  agentTurns,
  isAgentRunning,
  isPlanLoading,
  pendingInstruction,
  planPhrase,
  runPhrase,
  messages,
}: Props) {
  if (messages.length === 0 && agentTurns.length === 0 && !isAgentRunning) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3">
        <div className="w-10 h-10 rounded-md bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <Users className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/50">No internal activity yet</p>
          <p className="text-xs text-white/30 mt-1">
            Type <span className="font-mono font-semibold text-violet-400">@{agentName.toLowerCase()}</span> to ask the AI agent, or add a note for your team.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      {messages.map((msg) => (
        <div key={msg.id} className="w-full">
          <div className="flex gap-3">
            {msg.isAgentNote ? (
              <div className="w-7 h-7 rounded-full bg-violet-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-violet-400" />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold text-amber-400">
                {(msg.author ?? "Y")[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5 mb-1.5">
                <span className={`text-[12px] font-semibold ${msg.isAgentNote ? "text-violet-400" : "text-white/60"}`}>
                  {msg.author ?? "You"}
                </span>
                <span className="text-[11px] text-white/30">added a note</span>
                <span className="text-[11px] text-white/25 ml-auto">{msg.time}</span>
              </div>
              <div className={msg.isAgentNote
                ? "bg-violet-500/10 border border-violet-500/20 rounded-lg rounded-tl-sm px-3.5 py-2.5"
                : "bg-amber-400/10 border border-amber-400/20 rounded-lg rounded-tl-sm px-3.5 py-2.5"
              }>
                <p className="text-[13px] text-white/70 leading-relaxed">{msg.text}</p>
              </div>
            </div>
          </div>
        </div>
      ))}

      {agentTurns.map((turn, index) => (
        <div key={turn.id ?? `${turn.instruction}-${index}`} className="space-y-2">
          <div className="flex flex-col gap-1 items-end">
            {turn.senderPhone && (
              <div className="flex items-center gap-1 text-[10px] text-white/30 mr-1">
                <Smartphone className="w-3 h-3" />
                Via SMS · {turn.senderPhone}
              </div>
            )}
            <div className="px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-white/[0.08] text-white/70 rounded-md rounded-tr-sm">
              <span className="text-violet-400 font-semibold">@{agentName.toLowerCase()}</span>{" "}
              {turn.instruction}
            </div>
          </div>
          <div className="flex flex-col gap-1 items-start">
            <div className="flex items-center gap-1.5 mb-0.5 ml-1">
              <Bot className="w-3 h-3 text-violet-400" />
              <span className="text-[11px] font-semibold text-violet-400">{agentName}</span>
            </div>
            <div className="px-4 py-3 max-w-[80%] bg-violet-500/10 border border-violet-500/20 rounded-md rounded-tl-sm space-y-2">
              {turn.error ? (
                <p className="text-xs text-red-400">{turn.error}</p>
              ) : (
                <>
                  {turn.actions.length > 0 && (
                    <div className="space-y-1">
                      {turn.actions.map((action, actionIndex) => {
                        const isError = action.result.startsWith("Error:")
                        return (
                          <div key={actionIndex} className="flex items-center gap-1.5">
                            {isError
                              ? <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                              : <Check className="w-3 h-3 text-green-400 shrink-0" />
                            }
                            <span className={`text-xs ${isError ? "text-red-400" : "text-white/40"}`}>
                              {isError ? action.result : (TOOL_LABELS[action.tool] ?? action.tool)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {turn.summary && (
                    <p className="text-[14px] text-white/70 leading-relaxed">{turn.summary}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ))}

      {(isPlanLoading || isAgentRunning) && (
        <div className="space-y-2">
          {pendingInstruction && (
            <div className="flex flex-col gap-1 items-end">
              <div className="px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-white/[0.08] text-white/70 rounded-md rounded-tr-sm">
                <span className="text-violet-400 font-semibold">@{agentName.toLowerCase()}</span>{" "}
                {pendingInstruction}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1 items-start">
            <div className="flex items-center gap-1.5 mb-0.5 ml-1">
              <Bot className="w-3 h-3 text-violet-400" />
              <span className="text-[11px] font-semibold text-violet-400">{agentName}</span>
            </div>
            <div className="px-4 py-3 bg-violet-500/10 border border-violet-500/20 rounded-md rounded-tl-sm">
              <div className="flex items-center gap-1.5 text-xs text-violet-400">
                <RefreshCw className="w-3 h-3 animate-spin" />
                {isPlanLoading ? planPhrase : runPhrase}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
