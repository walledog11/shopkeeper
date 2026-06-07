import { useCallback, useMemo, useState } from 'react'
import type { AgentTurn, Message, Thread } from '@/types'
import { extractAgentTurnsFromMessages, serializeAgentTurn, type AgentTurnAction } from '@/lib/agent/api/turns'
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants'

interface UseAgentTurnsProps {
  activeTicketId: string | null
  activeThread: Thread | undefined
  agentActionsByTurnId: Record<string, AgentTurnAction[]> | undefined
  patchThreadCaches: (threadId: string, updateThread: (thread: Thread) => Thread) => Promise<void>
  revalidateThreadCaches: () => Promise<void>
}

export function useAgentTurns({
  activeTicketId,
  activeThread,
  agentActionsByTurnId,
  patchThreadCaches,
  revalidateThreadCaches,
}: UseAgentTurnsProps) {
  const [agentTurnsByThread, setAgentTurnsByThread] = useState<Record<string, AgentTurn[]>>({})
  const [agentRunningThread, setAgentRunningThread] = useState<string | null>(null)

  const activeAgentTurns = useMemo((): AgentTurn[] => {
    const dbTurns = extractAgentTurnsFromMessages(activeThread?.messages ?? [], agentActionsByTurnId)
    const errorTurns = activeTicketId ? (agentTurnsByThread[activeTicketId] ?? []) : []
    return [...dbTurns, ...errorTurns]
  }, [activeThread?.messages, activeTicketId, agentActionsByTurnId, agentTurnsByThread])

  const isAgentRunning = agentRunningThread === activeTicketId

  const handleAgentTurnAdd = useCallback((turn: AgentTurn) => {
    if (!activeTicketId) return
    setAgentTurnsByThread(prev => ({
      ...prev,
      [activeTicketId]: [...(prev[activeTicketId] ?? []), turn],
    }))
  }, [activeTicketId])

  const handleAgentRunningChange = useCallback((running: boolean) => {
    setAgentRunningThread(running ? activeTicketId : null)
  }, [activeTicketId])

  const handleAgentComplete = useCallback((turn: AgentTurn) => {
    if (!activeTicketId) return
    const threadId = activeTicketId
    const optimisticMsg: Message = {
      id: `agent-turn-${Date.now()}`,
      threadId,
      senderType: SENDER_TYPE.NOTE,
      contentText: serializeAgentTurn(turn),
      mediaUrl: null,
      attachments: [],
      sentAt: new Date().toISOString(),
    }

    void (async () => {
      await patchThreadCaches(threadId, thread => ({
        ...thread,
        messages: [...thread.messages, optimisticMsg],
      }))
      await revalidateThreadCaches()
    })()
  }, [activeTicketId, patchThreadCaches, revalidateThreadCaches])

  return {
    activeAgentTurns,
    isAgentRunning,
    handleAgentTurnAdd,
    handleAgentRunningChange,
    handleAgentComplete,
  }
}
