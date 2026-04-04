import { useState, useCallback, useMemo } from 'react'
import type { Thread, Message, AgentTurn } from '@/types'
import { AGENT_TURN_PREFIX } from '@/lib/agent/tools'

interface UseAgentTurnsProps {
  activeTicketId: string | null
  activeTab: 'open' | 'closed'
  activeThread: Thread | undefined
  mutateOpen: (data?: Thread[], revalidate?: boolean) => Promise<Thread[] | undefined>
  mutateClosed: (data?: Thread[], revalidate?: boolean) => Promise<Thread[] | undefined>
  openThreads: Thread[]
  closedThreads: Thread[]
}

export function useAgentTurns({
  activeTicketId,
  activeTab,
  activeThread,
  mutateOpen,
  mutateClosed,
  openThreads,
  closedThreads,
}: UseAgentTurnsProps) {
  const [agentTurnsByThread, setAgentTurnsByThread] = useState<Record<string, AgentTurn[]>>({})
  const [agentRunningThread, setAgentRunningThread] = useState<string | null>(null)

  // Derive persisted agent turns from the thread messages (survive page refresh)
  const activeAgentTurns = useMemo((): AgentTurn[] => {
    const dbTurns = (activeThread?.messages ?? [])
      .filter(m => m.senderType === 'note' && m.contentText?.startsWith(AGENT_TURN_PREFIX))
      .map(m => {
        try { return JSON.parse(m.contentText!.slice(AGENT_TURN_PREFIX.length)) as AgentTurn }
        catch { return null }
      })
      .filter((t): t is AgentTurn => t !== null)
    // Overlay in-session error turns (transient, not persisted)
    const errorTurns = activeTicketId ? (agentTurnsByThread[activeTicketId] ?? []) : []
    return [...dbTurns, ...errorTurns]
  }, [activeThread, activeTicketId, agentTurnsByThread])

  const isAgentRunning = agentRunningThread === activeTicketId

  // Only used for transient error turns (not persisted to DB)
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
    const mutateFn = activeTab === 'open' ? mutateOpen : mutateClosed
    const currentThreads = activeTab === 'open' ? openThreads : closedThreads
    // Optimistically insert the turn into the thread messages so it shows instantly
    const optimisticMsg: Message = {
      id: `agent-turn-${Date.now()}`,
      threadId: activeTicketId,
      senderType: 'note',
      contentText: `${AGENT_TURN_PREFIX}${JSON.stringify(turn)}`,
      mediaUrl: null,
      sentAt: new Date().toISOString(),
    }
    mutateFn(
      currentThreads.map(t => t.id === activeTicketId
        ? { ...t, messages: [...t.messages, optimisticMsg] }
        : t),
      false
    )
    mutateOpen()
    mutateClosed()
  }, [activeTicketId, activeTab, mutateOpen, mutateClosed, openThreads, closedThreads])

  return {
    activeAgentTurns,
    isAgentRunning,
    handleAgentTurnAdd,
    handleAgentRunningChange,
    handleAgentComplete,
  }
}
