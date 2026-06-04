import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/api/fetcher'
import { threadToTicket } from '../_lib/thread-to-ticket'
import type { ActiveThreadData } from './useThreadCacheCoordinator'
import type { Thread, Ticket } from '@/types'

type TicketListTab = 'open' | 'closed' | 'filtered'

interface UseActiveThreadSelectionProps {
  queryThreadId: string | null
  activeTab: TicketListTab
  openThreads: Thread[]
  closedThreads: Thread[]
  filteredThreads: Thread[]
  searchThreads: Thread[]
  agentName: string
}

function createLoadingTicket(threadId: string): Ticket {
  return {
    id: threadId,
    channelType: 'email',
    platform: 'Conversation',
    logo: '',
    customer: 'Loading conversation',
    time: 'Now',
    subject: 'Loading conversation',
    preview: '',
    tag: 'Support',
    tagColor: 'text-slate-500 bg-slate-100 border-slate-200',
    aiSummary: '',
    status: 'open',
    lastCustomerMessageAt: null,
    hasPlan: false,
    filterStatus: 'genuine',
    filterReason: null,
    messages: [],
  }
}

export function useActiveThreadSelection({
  queryThreadId,
  activeTab,
  openThreads,
  closedThreads,
  filteredThreads,
  searchThreads,
  agentName,
}: UseActiveThreadSelectionProps) {
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null)
  const appliedQueryThreadRef = useRef<string | null>(null)

  const activeThreadKey = activeTicketId ? `/api/threads/${activeTicketId}` : null
  const {
    data: activeThreadData,
    error: activeThreadError,
    mutate: mutateActiveThread,
  } = useSWR<ActiveThreadData>(activeThreadKey, fetcher)
  const activeThread = activeThreadData?.thread

  useEffect(() => {
    if (!queryThreadId) {
      appliedQueryThreadRef.current = null
      return
    }
    if (appliedQueryThreadRef.current === queryThreadId) return
    appliedQueryThreadRef.current = queryThreadId
    setActiveTicketId(current => current === queryThreadId ? current : queryThreadId)
  }, [queryThreadId])

  const effectiveActiveTab = useMemo(() => {
    if (queryThreadId) {
      if (activeThread?.id === queryThreadId) {
        if (activeThread.filterStatus === 'filtered') return 'filtered'
        return activeThread.status === 'closed' ? 'closed' : 'open'
      }
      if (openThreads.some(thread => thread.id === queryThreadId)) return 'open'
      if (closedThreads.some(thread => thread.id === queryThreadId)) return 'closed'
      if (filteredThreads.some(thread => thread.id === queryThreadId)) return 'filtered'
    }
    return activeTab
  }, [activeTab, activeThread, closedThreads, filteredThreads, openThreads, queryThreadId])

  const activeTicket = activeThread ? threadToTicket(activeThread, agentName) : undefined
  const activeThreadPreview = useMemo(
    () => {
      if (!activeTicketId) return undefined
      return openThreads.find(thread => thread.id === activeTicketId)
        ?? closedThreads.find(thread => thread.id === activeTicketId)
        ?? filteredThreads.find(thread => thread.id === activeTicketId)
        ?? searchThreads.find(thread => thread.id === activeTicketId)
    },
    [activeTicketId, closedThreads, filteredThreads, openThreads, searchThreads],
  )
  const activeTicketPreview = useMemo(
    () => activeThreadPreview ? threadToTicket(activeThreadPreview, agentName) : undefined,
    [activeThreadPreview, agentName],
  )
  const isConversationLoading = Boolean(activeTicketId && !activeThread && !activeThreadError)
  const conversationTicket = useMemo(
    () => {
      if (activeTicket) return activeTicket
      if (!isConversationLoading || !activeTicketId) return undefined
      return activeTicketPreview ?? createLoadingTicket(activeTicketId)
    },
    [activeTicket, activeTicketId, activeTicketPreview, isConversationLoading],
  )

  return {
    activeTicketId,
    setActiveTicketId,
    activeThread,
    activeThreadData,
    activeThreadError,
    activeThreadPreview,
    activeTicket,
    activeTicketPreview,
    conversationTicket,
    effectiveActiveTab,
    isConversationLoading,
    mutateActiveThread,
  }
}
