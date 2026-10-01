import { useCallback, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/api/fetcher'
import { REALTIME_ENABLED } from '@/lib/realtime/config'
import { useDocumentVisible } from '@/hooks/useDocumentVisible'
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

/** Fallback poll while a conversation is open — complements SSE list revalidation. */
const ACTIVE_THREAD_REFRESH_MS = REALTIME_ENABLED ? 30_000 : 15_000

function mergeMessages(older: ActiveThreadData, newer: ActiveThreadData): ActiveThreadData {
  const messages = new Map(older.thread.messages.map(message => [message.id, message]))
  for (const message of newer.thread.messages) messages.set(message.id, message)
  return {
    ...newer,
    nextMessageCursor: older.nextMessageCursor,
    thread: {
      ...newer.thread,
      messages: [...messages.values()].sort((a, b) =>
        new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime() || a.id.localeCompare(b.id)),
    },
    agentActionsByTurnId: { ...older.agentActionsByTurnId, ...newer.agentActionsByTurnId },
  }
}

export function useActiveThreadSelection({
  queryThreadId,
  knownThreads,
}: UseActiveThreadSelectionProps) {
  const isVisible = useDocumentVisible()
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
  const [history, setHistory] = useState<ActiveThreadData | null>(null)
  const [olderLoad, setOlderLoad] = useState<{ id: string; error: string | null; loading: boolean } | null>(null)
  const loadingOlder = useRef(false)
  const {
    data: latestThreadData,
    error: activeThreadError,
    mutate: mutateActiveThread,
  } = useSWR<ActiveThreadData>(activeThreadKey, fetcher, {
    refreshInterval: activeThreadKey && isVisible ? ACTIVE_THREAD_REFRESH_MS : 0,
    onSuccess: data => setHistory(current => current?.thread.id === data.thread.id
      ? mergeMessages(current, data) : current),
  })
  const activeThreadData = useMemo(() => latestThreadData && history?.thread.id === latestThreadData.thread.id
    ? mergeMessages(history, latestThreadData) : latestThreadData, [history, latestThreadData])
  const loadOlderMessages = useCallback(async () => {
    const cursor = activeThreadData?.nextMessageCursor
    if (!activeTicketId || !activeThreadData || !cursor || loadingOlder.current) return
    const id = activeTicketId
    loadingOlder.current = true
    setHistory(current => current?.thread.id === id ? current : activeThreadData)
    setOlderLoad({ id, error: null, loading: true })
    try {
      const older = await fetcher<ActiveThreadData>(`/api/threads/${id}?before=${encodeURIComponent(cursor)}`)
      setHistory(current => mergeMessages(older, current?.thread.id === id
        ? current : activeThreadData))
      setOlderLoad({ id, error: null, loading: false })
    } catch {
      setOlderLoad({ id, error: 'Could not load earlier messages. Try again.', loading: false })
    } finally {
      loadingOlder.current = false
    }
  }, [activeThreadData, activeTicketId])
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
    hasOlderMessages: Boolean(activeThreadData?.nextMessageCursor),
    isLoadingOlderMessages: olderLoad?.id === activeTicketId && olderLoad.loading,
    olderMessagesError: olderLoad?.id === activeTicketId ? olderLoad.error : null,
    loadOlderMessages,
  }
}
