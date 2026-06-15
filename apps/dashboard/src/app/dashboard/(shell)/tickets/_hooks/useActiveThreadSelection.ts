import { useCallback, useMemo, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/api/fetcher'
import { threadToTicket } from '../_lib/thread-to-ticket'
import type { ActiveThreadData } from './useThreadCacheCoordinator'
import type { TicketListView } from '../_components/thread-list/constants'
import type { Thread, Ticket } from '@/types'

interface UseActiveThreadSelectionProps {
  queryThreadId: string | null
  activeView: TicketListView
  forMeThreads: Thread[]
  allOpenThreads: Thread[]
  closedThreads: Thread[]
  spamThreads: Thread[]
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
    customerRecord: null,
    time: 'Now',
    lastMessageAt: new Date().toISOString(),
    subject: 'Loading conversation',
    preview: '',
    tag: 'Support',
    tagColor: 'text-slate-500 bg-slate-100 border-slate-200',
    aiSummary: '',
    status: 'open',
    lastCustomerMessageAt: null,
    hasPlan: false,
    cachedPlan: null,
    cachedPlanMessageId: null,
    shopifyCustomerId: null,
    filterStatus: 'genuine',
    filterReason: null,
    messages: [],
  }
}

export function useActiveThreadSelection({
  queryThreadId,
  activeView,
  forMeThreads,
  allOpenThreads,
  closedThreads,
  spamThreads,
  searchThreads,
  agentName,
}: UseActiveThreadSelectionProps) {
  const [selectedActiveTicketId, setSelectedActiveTicketId] = useState<string | null>(null)
  const [dismissedQueryThreadId, setDismissedQueryThreadId] = useState<string | null>(null)
  const queryActiveTicketId = queryThreadId && dismissedQueryThreadId !== queryThreadId ? queryThreadId : null
  const activeTicketId = queryActiveTicketId ?? selectedActiveTicketId
  const setActiveTicketId = useCallback((
    value: string | null | ((current: string | null) => string | null),
  ) => {
    const next = typeof value === 'function' ? value(activeTicketId) : value
    if (queryActiveTicketId && next !== queryActiveTicketId) {
      setDismissedQueryThreadId(queryActiveTicketId)
    }
    setSelectedActiveTicketId(next)
  }, [activeTicketId, queryActiveTicketId])

  const activeThreadKey = activeTicketId ? `/api/threads/${activeTicketId}` : null
  const {
    data: activeThreadData,
    error: activeThreadError,
    mutate: mutateActiveThread,
  } = useSWR<ActiveThreadData>(activeThreadKey, fetcher)
  const activeThread = activeThreadData?.thread

  const effectiveActiveView = useMemo(() => {
    if (queryThreadId) {
      if (activeThread?.id === queryThreadId) {
        if (activeThread.filterStatus === 'filtered') return 'spam'
        return activeThread.status === 'closed' ? 'closed' : activeView === 'all_open' ? 'all_open' : 'for_me'
      }
      if (forMeThreads.some(thread => thread.id === queryThreadId)) return 'for_me'
      if (allOpenThreads.some(thread => thread.id === queryThreadId)) return 'all_open'
      if (closedThreads.some(thread => thread.id === queryThreadId)) return 'closed'
      if (spamThreads.some(thread => thread.id === queryThreadId)) return 'spam'
    }
    return activeView
  }, [activeView, activeThread, allOpenThreads, closedThreads, forMeThreads, queryThreadId, spamThreads])

  const activeTicket = activeThread ? threadToTicket(activeThread, agentName) : undefined
  const activeThreadPreview = useMemo(
    () => {
      if (!activeTicketId) return undefined
      return forMeThreads.find(thread => thread.id === activeTicketId)
        ?? allOpenThreads.find(thread => thread.id === activeTicketId)
        ?? closedThreads.find(thread => thread.id === activeTicketId)
        ?? spamThreads.find(thread => thread.id === activeTicketId)
        ?? searchThreads.find(thread => thread.id === activeTicketId)
    },
    [activeTicketId, allOpenThreads, closedThreads, forMeThreads, searchThreads, spamThreads],
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
    effectiveActiveView,
    isConversationLoading,
    mutateActiveThread,
  }
}
