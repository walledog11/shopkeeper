import { useCallback, useMemo, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/api/fetcher'
import { threadToTicket } from '../_lib/thread-to-ticket'
import type { ActiveThreadData } from './useThreadCacheCoordinator'
import type { Thread, Ticket } from '@/types'

interface UseActiveThreadSelectionProps {
  queryThreadId: string | null
  /** Every thread already on the client, in any cache — used only for a preview. */
  knownThreads: Thread[]
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
    escalatedAt: null,
    aiSummary: '',
    status: 'open',
    lastCustomerMessageAt: null,
    hasPlan: false,
    cachedPlan: null,
    cachedPlanMessageId: null,
    shopifyCustomerId: null,
    filterStatus: 'genuine',
    filterReason: null,
    requestDisposition: null,
    messages: [],
  }
}

export function useActiveThreadSelection({
  queryThreadId,
  knownThreads,
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

  const activeTicket = activeThread ? threadToTicket(activeThread) : undefined
  const activeThreadPreview = useMemo(
    () => activeTicketId
      ? knownThreads.find(thread => thread.id === activeTicketId)
      : undefined,
    [activeTicketId, knownThreads],
  )
  const activeTicketPreview = useMemo(
    () => activeThreadPreview ? threadToTicket(activeThreadPreview) : undefined,
    [activeThreadPreview],
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
    conversationTicket,
    isConversationLoading,
    mutateActiveThread,
  }
}
