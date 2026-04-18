"use client"

import { AlertTriangle, MessageSquare } from "lucide-react"
import type { FailedMessage, Ticket } from "@/types"

interface Props {
  failedMessages: FailedMessage[]
  isAgentRunning: boolean
  messages: Ticket["messages"]
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  onRetry?: (id: string) => void
}

function AttachmentList({ attachments }: { attachments: string[] }) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {attachments.map((url, index) => (
        /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)
          ? <img key={index} src={url} alt="attachment" className="max-w-[240px] rounded-md border border-white/[0.10]" />
          : <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 underline">Download attachment</a>
      ))}
    </div>
  )
}

export default function ChatTimeline({
  failedMessages,
  isAgentRunning,
  messages,
  messagesEndRef,
  onRetry,
}: Props) {
  if (messages.length === 0 && !isAgentRunning) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3">
        <div className="w-10 h-10 rounded-md bg-white/[0.05] border border-border flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-white/20" />
        </div>
        <p className="text-sm text-white/30">No messages yet</p>
      </div>
    )
  }

  return (
    <>
      {messages.map((msg) => (
        <div key={msg.id} className={`flex flex-col gap-1 ${msg.sender === "agent" || msg.sender === "ai" ? "items-end" : "items-start"}`}>
          <div className={`px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed ${
            msg.sender === "agent" || msg.sender === "ai"
              ? "bg-white/[0.14] text-white rounded-md rounded-tr-sm"
              : "bg-white/[0.07] border border-white/[0.10] text-white/75 rounded-md rounded-tl-sm"
          }`}>
            {msg.text}
            <AttachmentList attachments={msg.attachments ?? []} />
          </div>
          <span className="text-[10px] text-white/25 mx-1">{msg.time}</span>
        </div>
      ))}

      {failedMessages.map(failedMessage => (
        <div key={failedMessage.id} className="flex flex-col gap-1 items-end">
          <div className="px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-red-500/10 border border-red-500/30 text-white/70 rounded-md rounded-tr-sm">
            {failedMessage.text}
          </div>
          <div className="flex items-center gap-1.5 mx-1">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-[10px] text-red-400">Failed to send</span>
            <span className="text-[10px] text-white/20">·</span>
            <button
              onClick={() => onRetry?.(failedMessage.id)}
              className="text-[10px] font-semibold text-red-400 hover:text-red-300 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      ))}

      <div ref={messagesEndRef} />
    </>
  )
}
