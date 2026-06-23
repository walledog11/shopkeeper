"use client"

import { isImageAttachmentUrl } from "@/lib/attachments/blob-ref"
import { AlertTriangle, Loader2, MessageSquare } from "lucide-react"
import Image from "next/image"
import type { FailedMessage, Ticket } from "@/types"

interface Props {
  failedMessages: FailedMessage[]
  isAgentRunning: boolean
  messages: Ticket["messages"]
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  onRetry?: (id: string) => void
  onRetrySend?: (id: string) => void
}

function AttachmentList({ attachments }: { attachments: string[] }) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {attachments.map((url) => (
        isImageAttachmentUrl(url)
          ? <Image key={url} src={url} alt="attachment" width={240} height={160} unoptimized className="h-auto max-w-[240px] rounded-md border border-foreground/[0.10]" />
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
  onRetrySend,
}: Props) {
  if (messages.length === 0 && !isAgentRunning) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3">
        <div className="size-10 rounded-2xl bg-foreground/[0.05] border border-border flex items-center justify-center">
          <MessageSquare className="size-4 text-foreground/20" />
        </div>
        <p className="text-sm text-foreground/30">No messages yet</p>
      </div>
    )
  }

  return (
    <>
      {messages.map((msg) => {
        const isOutbound = msg.sender === "agent" || msg.sender === "ai"
        const isPending = isOutbound && msg.sendStatus === "pending"
        const isFailed = isOutbound && msg.sendStatus === "failed"

        return (
          <div
            key={msg.id}
            data-testid="chat-message"
            data-message-id={msg.id}
            data-sender={msg.sender}
            data-send-status={msg.sendStatus ?? undefined}
            className={`flex flex-col gap-1 ${isOutbound ? "items-end" : "items-start"}`}
          >
            <div
              data-testid="chat-message-bubble"
              data-message-id={msg.id}
              data-sender={msg.sender}
              className={`px-4 py-3 text-[14px] max-w-[80%] leading-relaxed shadow-sm ${
                isFailed
                  ? "bg-red-500/10 border border-red-500/30 text-foreground/70 rounded-2xl rounded-tr-md"
                  : isOutbound
                    ? "bg-foreground/[0.14] text-foreground/90 rounded-2xl rounded-tr-md"
                    : "bg-card border border-border text-foreground/80 rounded-2xl rounded-tl-md"
              }`}
            >
              {msg.text}
              <AttachmentList attachments={msg.attachments ?? []} />
            </div>
            {isPending ? (
              <span className="flex items-center gap-1.5 text-xs text-foreground/30 mx-1">
                <Loader2 className="size-3 animate-spin" />
                Sending…
              </span>
            ) : isFailed ? (
              <div className="flex items-center gap-1.5 mx-1">
                <AlertTriangle className="size-3 text-red-400" />
                <span className="text-xs text-red-400">Failed to send</span>
                <span className="text-xs text-foreground/20">·</span>
                <button type="button"
                  onClick={() => onRetrySend?.(msg.id)}
                  className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : (
              <span className="text-xs text-foreground/25 mx-1">{msg.time}</span>
            )}
          </div>
        )
      })}

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
            className="px-4 py-3 text-[14px] max-w-[80%] leading-relaxed shadow-sm bg-red-500/10 border border-red-500/30 text-foreground/70 rounded-2xl rounded-tr-md"
          >
            {failedMessage.text}
          </div>
          <div className="flex items-center gap-1.5 mx-1">
            <AlertTriangle className="size-3 text-red-400" />
            <span className="text-xs text-red-400">Failed to send</span>
            <span className="text-xs text-foreground/20">·</span>
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
