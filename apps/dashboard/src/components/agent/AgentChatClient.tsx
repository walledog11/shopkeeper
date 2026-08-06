"use client"

import { AgentChatView, type AgentChatClientProps } from "./AgentChatView"
import { useAgentChatState } from "./useAgentChatState"

export default function AgentChatClient({ restoreHistory = true, ...props }: AgentChatClientProps) {
  return <AgentChatView {...props} state={useAgentChatState({ restoreHistory })} />
}
