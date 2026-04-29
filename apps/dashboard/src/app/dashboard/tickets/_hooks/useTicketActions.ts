import { useState, useCallback } from 'react'
import type { Thread, Message, FailedMessage } from '@/types'
import { SENDER_TYPE } from '@/lib/messaging/thread-constants'


interface UseTicketActionsProps {
  activeTicketId: string | null
  activeTab: 'open' | 'closed' | 'filtered'
  dbThreads: Thread[]
  openThreads: Thread[]
  closedThreads: Thread[]
  filteredThreads: Thread[]
  mutateOpen: (data?: Thread[], revalidate?: boolean) => Promise<Thread[] | undefined>
  mutateClosed: (data?: Thread[], revalidate?: boolean) => Promise<Thread[] | undefined>
  mutateFiltered: (data?: Thread[], revalidate?: boolean) => Promise<Thread[] | undefined>
  setActiveTab: (tab: 'open' | 'closed' | 'filtered') => void
  setActiveTicketId: (id: string | null) => void
  setSelectedIds: (ids: string[]) => void
}

export function useTicketActions({
  activeTicketId,
  activeTab,
  dbThreads,
  openThreads,
  closedThreads,
  filteredThreads,
  mutateOpen,
  mutateClosed,
  mutateFiltered,
  setActiveTab,
  setActiveTicketId,
  setSelectedIds,
}: UseTicketActionsProps) {
  const [replyText, setReplyText] = useState('')
  const [isDrafting, setIsDrafting] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [failedMessages, setFailedMessages] = useState<FailedMessage[]>([])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const getMutate = useCallback(
    () => activeTab === 'open' ? mutateOpen : activeTab === 'closed' ? mutateClosed : mutateFiltered,
    [activeTab, mutateOpen, mutateClosed, mutateFiltered]
  )

  const getCurrentThreads = useCallback(
    () => activeTab === 'open' ? openThreads : activeTab === 'closed' ? closedThreads : filteredThreads,
    [activeTab, openThreads, closedThreads, filteredThreads]
  )

  const handleSendMessage = useCallback(async (noteMode: boolean) => {
    if (!replyText.trim() || !activeTicketId) return
    const textToSend = replyText
    setReplyText('')
    setIsSending(true)
    setSendError(null)

    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      threadId: activeTicketId,
      senderType: noteMode ? SENDER_TYPE.NOTE : SENDER_TYPE.AGENT,
      contentText: textToSend,
      mediaUrl: null,
      attachments: [],
      sentAt: new Date().toISOString(),
    }

    const mutateFn = getMutate()
    const currentThreads = getCurrentThreads()

    await mutateFn(
      currentThreads.map(t => t.id === activeTicketId
        ? { ...t, messages: [...t.messages, optimisticMessage] }
        : t),
      false
    )

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: activeTicketId, text: textToSend, isNote: noteMode }),
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      mutateFn()
    } catch (err) {
      console.error('Failed to send message', err)
      setFailedMessages(prev => [...prev, { id: optimisticMessage.id, threadId: activeTicketId, text: textToSend, isNote: noteMode }])
      mutateFn()
    } finally {
      setIsSending(false)
    }
  }, [replyText, activeTicketId, getMutate, getCurrentThreads])

  const refreshAllLists = useCallback(() => {
    mutateOpen()
    mutateClosed()
    mutateFiltered()
  }, [mutateOpen, mutateClosed, mutateFiltered])

  const handleResolve = useCallback(async () => {
    if (!activeTicketId) return
    const resolvedId = activeTicketId
    setActiveTicketId(null)
    try {
      await fetch(`/api/threads/${resolvedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      })
      refreshAllLists()
      setActiveTab('closed')
      showToast('Ticket resolved')
    } catch (err) {
      console.error('Failed to resolve ticket', err)
    }
  }, [activeTicketId, refreshAllLists, setActiveTab, setActiveTicketId, showToast])

  const handleReopen = useCallback(async () => {
    if (!activeTicketId) return
    const reopenId = activeTicketId
    setActiveTicketId(null)
    try {
      await fetch(`/api/threads/${reopenId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'open' }),
      })
      refreshAllLists()
      setActiveTab('open')
      showToast('Ticket reopened')
    } catch (err) {
      console.error('Failed to reopen ticket', err)
    }
  }, [activeTicketId, refreshAllLists, setActiveTab, setActiveTicketId, showToast])

  const handleAiDraft = useCallback(async () => {
    if (!activeTicketId) return
    setIsDrafting(true)
    setReplyText('Clerk is thinking...')
    try {
      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: activeTicketId }),
      })
      const data = await res.json()
      setReplyText(data.draft || 'Failed to generate draft. Please try typing manually.')
    } catch (err) {
      console.error('AI Draft Error:', err)
      setReplyText('Failed to generate draft. Please try typing manually.')
    } finally {
      setIsDrafting(false)
    }
  }, [activeTicketId])

  const handleLinkShopifyCustomer = useCallback(async (customerId: string | null) => {
    if (!activeTicketId) return
    const mutateFn = getMutate()
    await mutateFn(dbThreads.map(t =>
      t.id === activeTicketId ? { ...t, shopifyCustomerId: customerId } : t
    ), false)
    try {
      const res = await fetch(`/api/threads/${activeTicketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyCustomerId: customerId }),
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
    } catch (err) {
      console.error('Failed to link Shopify customer', err)
      await mutateFn()
      throw err
    }
  }, [activeTicketId, dbThreads, getMutate])

  const handleRetry = useCallback(async (id: string) => {
    const failed = failedMessages.find(m => m.id === id)
    if (!failed) return
    setFailedMessages(prev => prev.filter(m => m.id !== id))

    const mutateFn = getMutate()
    const currentThreads = getCurrentThreads()

    const optimisticMessage: Message = {
      id,
      threadId: failed.threadId,
      senderType: failed.isNote ? SENDER_TYPE.NOTE : SENDER_TYPE.AGENT,
      contentText: failed.text,
      mediaUrl: null,
      attachments: [],
      sentAt: new Date().toISOString(),
    }

    await mutateFn(
      currentThreads.map(t => t.id === failed.threadId
        ? { ...t, messages: [...t.messages, optimisticMessage] }
        : t),
      false
    )

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: failed.threadId, text: failed.text, isNote: failed.isNote }),
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      mutateFn()
    } catch (err) {
      console.error('Failed to retry message', err)
      setFailedMessages(prev => [...prev, failed])
      mutateFn()
    }
  }, [failedMessages, getMutate, getCurrentThreads])

  const handleBulkClose = useCallback(async (selectedIds: string[]) => {
    if (selectedIds.length === 0) return
    const ids = [...selectedIds]
    setSelectedIds([])
    try {
      await fetch('/api/threads/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'close' }),
      })
      refreshAllLists()
      if (activeTicketId && ids.includes(activeTicketId)) setActiveTicketId(null)
      showToast(`${ids.length} ticket${ids.length !== 1 ? 's' : ''} closed`)
    } catch (err) {
      console.error('Bulk close failed', err)
    }
  }, [activeTicketId, refreshAllLists, setActiveTicketId, setSelectedIds, showToast])

  const handleBulkArchive = useCallback(async (selectedIds: string[]) => {
    if (selectedIds.length === 0) return
    const ids = [...selectedIds]
    setSelectedIds([])
    try {
      await fetch('/api/threads/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'archive' }),
      })
      refreshAllLists()
      if (activeTicketId && ids.includes(activeTicketId)) setActiveTicketId(null)
      showToast(`${ids.length} ticket${ids.length !== 1 ? 's' : ''} archived`)
    } catch (err) {
      console.error('Bulk archive failed', err)
    }
  }, [activeTicketId, refreshAllLists, setActiveTicketId, setSelectedIds, showToast])

  const handleMarkAsSpam = useCallback(async (threadId: string) => {
    try {
      await fetch(`/api/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterStatus: 'filtered', filterFeedback: 'confirmed_spam' }),
      })
      refreshAllLists()
      if (activeTicketId === threadId) setActiveTicketId(null)
      showToast('Marked as spam')
    } catch (err) {
      console.error('Failed to mark as spam', err)
    }
  }, [activeTicketId, refreshAllLists, setActiveTicketId, showToast])

  const handleRecover = useCallback(async (threadId: string) => {
    try {
      await fetch(`/api/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterStatus: 'genuine', filterFeedback: 'confirmed_genuine' }),
      })
      refreshAllLists()
      if (activeTicketId === threadId) setActiveTicketId(null)
      showToast('Recovered to inbox')
    } catch (err) {
      console.error('Failed to recover thread', err)
    }
  }, [activeTicketId, refreshAllLists, setActiveTicketId, showToast])

  const handleBulkTag = useCallback(async (selectedIds: string[], tag: string) => {
    if (selectedIds.length === 0) return
    const ids = [...selectedIds]
    setSelectedIds([])
    try {
      await fetch('/api/threads/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'tag', tag }),
      })
      refreshAllLists()
      showToast(`Tagged ${ids.length} ticket${ids.length !== 1 ? 's' : ''}`)
    } catch (err) {
      console.error('Bulk tag failed', err)
    }
  }, [refreshAllLists, setSelectedIds, showToast])

  return {
    replyText,
    setReplyText,
    isDrafting,
    isSending,
    sendError,
    setSendError,
    toast,
    failedMessages,
    handleSendMessage,
    handleRetry,
    handleResolve,
    handleReopen,
    handleAiDraft,
    handleLinkShopifyCustomer,
    handleBulkClose,
    handleBulkArchive,
    handleBulkTag,
    handleMarkAsSpam,
    handleRecover,
  }
}
