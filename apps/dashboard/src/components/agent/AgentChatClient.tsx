"use client"

import { AgentChatView, type AgentChatClientProps } from "./AgentChatView"
import { useAgentChatState, type AgentChatState } from "./useAgentChatState"

export default function AgentChatClient({
  restoreHistory = true,
  state: externalState,
  ...props
}: AgentChatClientProps & { state?: AgentChatState }) {
  const internalState = useAgentChatState({ restoreHistory })
  return <AgentChatView {...props} state={externalState ?? internalState} />
}
