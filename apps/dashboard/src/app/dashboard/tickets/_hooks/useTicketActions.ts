import { useCallback, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { FailedMessage, Message, Thread, ThreadFilterFeedback, ThreadFilterStatus } from '@/types'
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants'
import { errorMessageFromUnknown, requestOk } from '@/lib/api/fetcher'

export interface TicketToast {
  message: string
  tone: 'success' | 'error'
}

interface UseTicketActionsProps {
  activeTicketId: string | null
  patchThreadCaches: (threadId: string, updateThread: (thread: Thread) => Thread) => Promise<void>
  revalidateThreadCaches: () => Promise<void>
  moveThreadStatus: (threadId: string, nextStatus: 'open' | 'closed') => Promise<void>
  moveThreadFilterStatus: (
    threadId: string,
    nextFilterStatus: ThreadFilterStatus,
    nextFilterFeedback?: ThreadFilterFeedback,
  ) => Promise<void>
  setActiveTicketId: Dispatch<SetStateAction<string | null>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
}

const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const jsonPatch = (body: unknown): RequestInit => ({
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function useTicketActions({
  activeTicketId,
  patchThreadCaches,
  revalidateThreadCaches,
  moveThreadStatus,
  moveThreadFilterStatus,
  setActiveTicketId,
  setSelectedIds,
}: UseTicketActionsProps) {
  const [replyText, setReplyText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [toast, setToast] = useState<TicketToast | null>(null)
  const [failedMessages, setFailedMessages] = useState<FailedMessage[]>([])
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((message: string, tone: TicketToast['tone'] = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast({ message, tone })
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2500)
  }, [])

  const handleSendMessage = useCallback(async (noteMode: boolean) => {
    if (!replyText.trim() || !activeTicketId) return
    const threadId = activeTicketId
    const textToSend = replyText
    setReplyText('')
    setIsSending(true)
    setSendError(null)

    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      threadId,
      senderType: noteMode ? SENDER_TYPE.NOTE : SENDER_TYPE.AGENT,
      contentText: textToSend,
      mediaUrl: null,
      attachments: [],
      sentAt: new Date().toISOString(),
    }

    await patchThreadCaches(threadId, thread => ({
      ...thread,
      messages: [...thread.messages, optimisticMessage],
    }))

    try {
      await requestOk('/api/messages', jsonPost({ threadId, text: textToSend, isNote: noteMode }), 'Failed to send message')
      await revalidateThreadCaches()
    } catch (err) {
      console.error('Failed to send message', err)
      setSendError(errorMessageFromUnknown(err, 'Failed to send message.'))
      setFailedMessages(prev => [...prev, { id: optimisticMessage.id, threadId, text: textToSend, isNote: noteMode }])
      await revalidateThreadCaches()
    } finally {
      setIsSending(false)
    }
  }, [activeTicketId, patchThreadCaches, replyText, revalidateThreadCaches])

  const handleResolve = useCallback(async () => {
    if (!activeTicketId) return
    const resolvedId = activeTicketId

    await moveThreadStatus(resolvedId, 'closed')
    setActiveTicketId(null)
    showToast('Ticket resolved')

    try {
      await requestOk(`/api/threads/${resolvedId}`, jsonPatch({ status: 'closed' }), 'Failed to close ticket')
      revalidateThreadCaches()
    } catch (err) {
      console.error('Failed to resolve ticket', err)
      await revalidateThreadCaches()
      showToast(errorMessageFromUnknown(err, 'Failed to close ticket.'), 'error')
    }
  }, [activeTicketId, moveThreadStatus, revalidateThreadCaches, setActiveTicketId, showToast])

  const handleReopen = useCallback(async () => {
    if (!activeTicketId) return
    const reopenId = activeTicketId

    await moveThreadStatus(reopenId, 'open')
    setActiveTicketId(null)
    showToast('Ticket reopened')

    try {
      await requestOk(`/api/threads/${reopenId}`, jsonPatch({ status: 'open' }), 'Failed to reopen ticket')
      revalidateThreadCaches()
    } catch (err) {
      console.error('Failed to reopen ticket', err)
      await revalidateThreadCaches()
      showToast(errorMessageFromUnknown(err, 'Failed to reopen ticket.'), 'error')
    }
  }, [activeTicketId, moveThreadStatus, revalidateThreadCaches, setActiveTicketId, showToast])

  const handleLinkShopifyCustomer = useCallback(async (customerId: string | null) => {
    if (!activeTicketId) return
    const threadId = activeTicketId
    await patchThreadCaches(threadId, thread => ({ ...thread, shopifyCustomerId: customerId }))
    try {
      await requestOk(`/api/threads/${threadId}`, jsonPatch({ shopifyCustomerId: customerId }), 'Failed to link Shopify customer')
      await revalidateThreadCaches()
    } catch (err) {
      console.error('Failed to link Shopify customer', err)
      await revalidateThreadCaches()
      throw err
    }
  }, [activeTicketId, patchThreadCaches, revalidateThreadCaches])

  const handleRetry = useCallback(async (id: string) => {
    const failed = failedMessages.find(m => m.id === id)
    if (!failed) return
    setFailedMessages(prev => prev.filter(m => m.id !== id))
    setSendError(null)

    const optimisticMessage: Message = {
      id,
      threadId: failed.threadId,
      senderType: failed.isNote ? SENDER_TYPE.NOTE : SENDER_TYPE.AGENT,
      contentText: failed.text,
      mediaUrl: null,
      attachments: [],
      sentAt: new Date().toISOString(),
    }

    await patchThreadCaches(failed.threadId, thread => ({
      ...thread,
      messages: [...thread.messages, optimisticMessage],
    }))

    try {
      await requestOk('/api/messages', jsonPost({ threadId: failed.threadId, text: failed.text, isNote: failed.isNote }), 'Failed to retry message')
      await revalidateThreadCaches()
    } catch (err) {
      console.error('Failed to retry message', err)
      setSendError(errorMessageFromUnknown(err, 'Failed to retry message.'))
      setFailedMessages(prev => [...prev, failed])
      await revalidateThreadCaches()
    }
  }, [failedMessages, patchThreadCaches, revalidateThreadCaches])

  const handleBulkClose = useCallback(async (selectedIds: string[]) => {
    if (selectedIds.length === 0) return
    const ids = [...selectedIds]
    try {
      await requestOk('/api/threads/bulk', jsonPatch({ ids, action: 'close' }), 'Failed to close selected tickets')
      await revalidateThreadCaches()
      setSelectedIds([])
      if (activeTicketId && ids.includes(activeTicketId)) setActiveTicketId(null)
      showToast(`${ids.length} ticket${ids.length !== 1 ? 's' : ''} closed`)
    } catch (err) {
      console.error('Bulk close failed', err)
      showToast(errorMessageFromUnknown(err, 'Failed to close selected tickets.'), 'error')
    }
  }, [activeTicketId, revalidateThreadCaches, setActiveTicketId, setSelectedIds, showToast])

  const handleBulkArchive = useCallback(async (selectedIds: string[]) => {
    if (selectedIds.length === 0) return
    const ids = [...selectedIds]
    try {
      await requestOk('/api/threads/bulk', jsonPatch({ ids, action: 'archive' }), 'Failed to archive selected tickets')
      await revalidateThreadCaches()
      setSelectedIds([])
      if (activeTicketId && ids.includes(activeTicketId)) setActiveTicketId(null)
      showToast(`${ids.length} ticket${ids.length !== 1 ? 's' : ''} archived`)
    } catch (err) {
      console.error('Bulk archive failed', err)
      showToast(errorMessageFromUnknown(err, 'Failed to archive selected tickets.'), 'error')
    }
  }, [activeTicketId, revalidateThreadCaches, setActiveTicketId, setSelectedIds, showToast])

  const handleMarkAsSpam = useCallback(async (threadId: string) => {
    try {
      await requestOk(`/api/threads/${threadId}`, jsonPatch({ filterStatus: 'filtered', filterFeedback: 'confirmed_spam' }), 'Failed to mark as spam')
      await moveThreadFilterStatus(threadId, 'filtered', 'confirmed_spam')
      await revalidateThreadCaches()
      if (activeTicketId === threadId) setActiveTicketId(null)
      showToast('Marked as spam')
    } catch (err) {
      console.error('Failed to mark as spam', err)
      showToast(errorMessageFromUnknown(err, 'Failed to mark as spam.'), 'error')
    }
  }, [activeTicketId, moveThreadFilterStatus, revalidateThreadCaches, setActiveTicketId, showToast])

  const handleRecover = useCallback(async (threadId: string) => {
    try {
      await requestOk(`/api/threads/${threadId}`, jsonPatch({ filterStatus: 'genuine', filterFeedback: 'confirmed_genuine' }), 'Failed to recover thread')
      await moveThreadFilterStatus(threadId, 'genuine', 'confirmed_genuine')
      await revalidateThreadCaches()
      if (activeTicketId === threadId) setActiveTicketId(null)
      showToast('Recovered to inbox')
    } catch (err) {
      console.error('Failed to recover thread', err)
      showToast(errorMessageFromUnknown(err, 'Failed to recover thread.'), 'error')
    }
  }, [activeTicketId, moveThreadFilterStatus, revalidateThreadCaches, setActiveTicketId, showToast])

  const handleBulkTag = useCallback(async (selectedIds: string[], tag: string) => {
    const trimmedTag = tag.trim()
    if (selectedIds.length === 0 || !trimmedTag) return
    const ids = [...selectedIds]
    try {
      await requestOk('/api/threads/bulk', jsonPatch({ ids, action: 'tag', tag: trimmedTag }), 'Failed to tag selected tickets')
      await revalidateThreadCaches()
      setSelectedIds([])
      showToast(`Tagged ${ids.length} ticket${ids.length !== 1 ? 's' : ''}`)
    } catch (err) {
      console.error('Bulk tag failed', err)
      showToast(errorMessageFromUnknown(err, 'Failed to tag selected tickets.'), 'error')
    }
  }, [revalidateThreadCaches, setSelectedIds, showToast])

  return {
    replyText,
    setReplyText,
    isSending,
    sendError,
    setSendError,
    toast,
    failedMessages,
    showToast,
    handleSendMessage,
    handleRetry,
    handleResolve,
    handleReopen,
    handleLinkShopifyCustomer,
    handleBulkClose,
    handleBulkArchive,
    handleBulkTag,
    handleMarkAsSpam,
    handleRecover,
  }
}
