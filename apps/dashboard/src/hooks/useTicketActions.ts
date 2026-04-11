import { useState, useCallback } from 'react'
import type { Thread, Message, FailedMessage } from '@/types'
import { SENDER_TYPE } from '@/lib/constants'
import logger from '@/lib/logger'


interface UseTicketActionsProps {
  activeTicketId: string | null
  activeTab: 'open' | 'closed'
  dbThreads: Thread[]
  openThreads: Thread[]
  closedThreads: Thread[]
  mutateOpen: (data?: Thread[], revalidate?: boolean) => Promise<Thread[] | undefined>
  mutateClosed: (data?: Thread[], revalidate?: boolean) => Promise<Thread[] | undefined>
  setActiveTab: (tab: 'open' | 'closed') => void
  setActiveTicketId: (id: string | null) => void
  setSelectedIds: (ids: string[]) => void
}

export function useTicketActions({
  activeTicketId,
  activeTab,
  dbThreads,
  openThreads,
  closedThreads,
  mutateOpen,
  mutateClosed,
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
  const [isRefreshingSummary, setIsRefreshingSummary] = useState(false)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const getMutate = useCallback(
    () => activeTab === 'open' ? mutateOpen : mutateClosed,
    [activeTab, mutateOpen, mutateClosed]
  )

  const getCurrentThreads = useCallback(
    () => activeTab === 'open' ? openThreads : closedThreads,
    [activeTab, openThreads, closedThreads]
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

  const handleSendNote = useCallback(async (text: string) => {
    if (!text.trim() || !activeTicketId) return
    setIsSending(true)
    setSendError(null)

    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      threadId: activeTicketId,
      senderType: SENDER_TYPE.NOTE,
      contentText: text,
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
        body: JSON.stringify({ threadId: activeTicketId, text, isNote: true }),
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      mutateFn()
    } catch (err) {
      console.error('Failed to send note', err)
      setFailedMessages(prev => [...prev, { id: optimisticMessage.id, threadId: activeTicketId, text, isNote: true }])
      mutateFn()
    } finally {
      setIsSending(false)
    }
  }, [activeTicketId, getMutate, getCurrentThreads])

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
      mutateOpen()
      mutateClosed()
      setActiveTab('closed')
      showToast('Ticket resolved')
    } catch (err) {
      console.error('Failed to resolve ticket', err)
    }
  }, [activeTicketId, mutateOpen, mutateClosed, setActiveTab, setActiveTicketId, showToast])

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
      mutateOpen()
      mutateClosed()
      setActiveTab('open')
      showToast('Ticket reopened')
    } catch (err) {
      console.error('Failed to reopen ticket', err)
    }
  }, [activeTicketId, mutateOpen, mutateClosed, setActiveTab, setActiveTicketId, showToast])

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
      await fetch(`/api/threads/${activeTicketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyCustomerId: customerId }),
      })
    } catch (err) {
      console.error('Failed to link Shopify customer', err)
      mutateFn()
    }
  }, [activeTicketId, dbThreads, getMutate])

  const handleTagUpdate = useCallback(async (tag: string) => {
    if (!activeTicketId) return
    const mutateFn = getMutate()
    await mutateFn(dbThreads.map(t =>
      t.id === activeTicketId ? { ...t, tag: tag || null } : t
    ), false)
    try {
      await fetch(`/api/threads/${activeTicketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      })
    } catch (err) {
      console.error('Failed to update tag', err)
      mutateFn()
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

  const handleRefreshSummary = useCallback(async () => {
    if (!activeTicketId) return
    setIsRefreshingSummary(true)
    try {
      const response = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: activeTicketId }),
      })
      const data = await response.json()
      if (!response.ok) {
        console.error('Clerk Error:', data.error)
        setSendError(`AI Error: ${data.error || 'Check the console'}`)
        return
      }
      const mutateFn = getMutate()
      if (data.summary) {
        await mutateFn(dbThreads.map(t =>
          t.id === activeTicketId ? { ...t, aiSummary: data.summary } : t
        ), false)
      } else {
        mutateFn()
      }
    } catch (err) {
      console.error('Network error:', err)
      setSendError('Network error: Failed to reach the AI endpoint.')
    } finally {
      setIsRefreshingSummary(false)
    }
  }, [activeTicketId, dbThreads, getMutate])

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
      mutateOpen()
      mutateClosed()
      if (activeTicketId && ids.includes(activeTicketId)) setActiveTicketId(null)
      showToast(`${ids.length} ticket${ids.length !== 1 ? 's' : ''} closed`)
    } catch (err) {
      logger.error({ err }, 'Bulk close failed')
    }
  }, [activeTicketId, mutateOpen, mutateClosed, setActiveTicketId, setSelectedIds, showToast])

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
      mutateOpen()
      mutateClosed()
      if (activeTicketId && ids.includes(activeTicketId)) setActiveTicketId(null)
      showToast(`${ids.length} ticket${ids.length !== 1 ? 's' : ''} archived`)
    } catch (err) {
      logger.error({ err }, 'Bulk archive failed')
    }
  }, [activeTicketId, mutateOpen, mutateClosed, setActiveTicketId, setSelectedIds, showToast])

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
      mutateOpen()
      mutateClosed()
      showToast(`Tagged ${ids.length} ticket${ids.length !== 1 ? 's' : ''}`)
    } catch (err) {
      logger.error({ err }, 'Bulk tag failed')
    }
  }, [mutateOpen, mutateClosed, setSelectedIds, showToast])

  return {
    replyText,
    setReplyText,
    isDrafting,
    isSending,
    sendError,
    setSendError,
    isRefreshingSummary,
    toast,
    failedMessages,
    handleSendMessage,
    handleSendNote,
    handleRetry,
    handleResolve,
    handleReopen,
    handleAiDraft,
    handleLinkShopifyCustomer,
    handleTagUpdate,
    handleRefreshSummary,
    handleBulkClose,
    handleBulkArchive,
    handleBulkTag,
  }
}
