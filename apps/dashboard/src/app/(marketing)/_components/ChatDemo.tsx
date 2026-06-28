"use client"

import { useRef } from "react"
import { IMessageChatDemo } from "./chat-demo/IMessageChatDemo"
import { InstagramChatDemo } from "./chat-demo/InstagramChatDemo"
import { useChatDemoAnimation } from "./chat-demo/useChatDemoAnimation"
import type { ChatMessage } from "./chat-demo/shared"

export type { ChatMessage } from "./chat-demo/shared"
export type ChatVariant = "instagram" | "imessage"

interface ChatDemoProps {
  title: string
  subtitle: string
  avatar: string
  avatarBg?: string
  messages: ChatMessage[]
  variant?: ChatVariant
}

export function ChatDemo({
  title,
  subtitle,
  avatar,
  avatarBg = "#2f7a4a",
  messages,
  variant = "instagram",
}: ChatDemoProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const animation = useChatDemoAnimation(messages, frameRef)
  const viewProps = {
    title,
    subtitle,
    avatar,
    avatarBg,
    messages,
    ...animation,
  }

  return (
    <div
      ref={frameRef}
      className="mx-auto w-[min(100%,300px)] rounded-[40px] bg-stone-900 p-1.5 shadow-[0_40px_80px_-30px_rgba(22,20,19,0.4)] sm:w-[320px] sm:rounded-[44px]"
    >
      {variant === "instagram"
        ? <InstagramChatDemo {...viewProps} />
        : <IMessageChatDemo {...viewProps} />
      }
    </div>
  )
}
