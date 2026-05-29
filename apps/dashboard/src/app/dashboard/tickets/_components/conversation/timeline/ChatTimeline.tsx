"use client"

import { AlertTriangle, MessageSquare } from "lucide-react"
import Image from "next/image"
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
      {attachments.map((url) => (
        /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)
          ? <Image key={url} src={url} alt="attachment" width={240} height={160} unoptimized className="h-auto max-w-[240px] rounded-md border border-white/[0.10]" />
          : <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 underline">Download attachment</a>
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
        <div className="size-10 rounded-md bg-white/[0.05] border border-border flex items-center justify-center">
          <MessageSquare className="size-4 text-white/20" />
        </div>
        <p className="text-sm text-white/30">No messages yet</p>
      </div>
    )
  }

  return (
    <>
      {messages.map((msg) => (
        <div
          key={msg.id}
          data-testid="chat-message"
          data-message-id={msg.id}
          data-sender={msg.sender}
          className={`flex flex-col gap-1 ${msg.sender === "agent" || msg.sender === "ai" ? "items-end" : "items-start"}`}
        >
          <div
            data-testid="chat-message-bubble"
            data-message-id={msg.id}
            data-sender={msg.sender}
            className={`px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed ${
              msg.sender === "agent" || msg.sender === "ai"
                ? "bg-white/[0.14] text-white rounded-md rounded-tr-sm"
                : "bg-white/[0.07] border border-white/[0.10] text-white/75 rounded-md rounded-tl-sm"
            }`}
          >
            {msg.text}
            <AttachmentList attachments={msg.attachments ?? []} />
          </div>
          <span className="text-xs text-white/25 mx-1">{msg.time}</span>
        </div>
      ))}

      {failedMessages.map(failedMessage => (
        <div
          key={failedMessage.id}
          data-testid="failed-chat-message"
          data-message-id={failedMessage.id}
          className="flex flex-col gap-1 items-end"
        >
          <div
            data-testid="failed-chat-message-bubble"
            data-message-id={failedMessage.id}
            className="px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-red-500/10 border border-red-500/30 text-white/70 rounded-md rounded-tr-sm"
          >
            {failedMessage.text}
          </div>
          <div className="flex items-center gap-1.5 mx-1">
            <AlertTriangle className="size-3 text-red-400" />
            <span className="text-xs text-red-400">Failed to send</span>
            <span className="text-xs text-white/20">·</span>
            <button type="button"
              onClick={() => onRetry?.(failedMessage.id)}
              className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
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
