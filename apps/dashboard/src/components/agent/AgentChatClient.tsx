"use client"

import { AgentChatView, type AgentChatClientProps } from "./AgentChatView"
import { useAgentChatState } from "./useAgentChatState"

export default function AgentChatClient({ restoreSession = true, ...props }: AgentChatClientProps) {
  return <AgentChatView {...props} state={useAgentChatState({ restoreSession })} />
}
