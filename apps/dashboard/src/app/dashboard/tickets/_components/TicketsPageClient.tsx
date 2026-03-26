"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import useSWR from "swr"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Inbox } from "lucide-react"
import { useThreads } from '@/hooks/useThreads'
import { formatTime, getCustomerName } from '@/lib/utils'
import { getChannelInfo } from '@/lib/channels'
import { fetcher } from '@/lib/fetcher'
import type { Integration } from '@/types'
import ThreadList from './ThreadList'
import ConversationView from './ConversationView'
import ContextPanel from './ContextPanel'
import type { Thread, Message, Ticket, ChannelType } from '@/types'

function threadToTicket(thread: Thread): Ticket {
  const channel = getChannelInfo(thread.channelType)
  const lastMsg = thread.messages.filter(m => m.senderType !== 'note').at(-1)
  return {
    id: thread.id,
    channelType: thread.channelType,
    platform: channel.name,
    logo: channel.logo,
    customer: getCustomerName(thread.customer),
    time: lastMsg ? formatTime(lastMsg.sentAt) : 'New',
    subject: thread.tag || "New Inquiry",
    preview: lastMsg?.contentText || "No messages yet.",
    tag: thread.tag || "Support",
    tagColor: "text-slate-500 bg-slate-100 border-slate-200",
    aiSummary: thread.aiSummary || "Clerk is analyzing this conversation...",
    status: thread.status,
    messages: thread.messages.map((msg) => ({
      sender: msg.senderType,
      text: msg.contentText,
      time: formatTime(msg.sentAt)
    }))
  }
}

interface Props {
  initialOpenThreads: Thread[]
}

export default function TicketsPageClient({ initialOpenThreads }: Props) {
  const searchParams = useSearchParams()
  const [activeFilter, setActiveFilter] = useState<ChannelType | null>(null)
  const [activeTab, setActiveTab] = useState<'open' | 'closed'>('open')
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [replyText, setReplyText] = useState("")
  const [isNote, setIsNote] = useState(false)
  const [isDrafting, setIsDrafting] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [resolveToast, setResolveToast] = useState(false)
  const [isRefreshingSummary, setIsRefreshingSummary] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkToast, setBulkToast] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { threads: openThreads, isLoading: openLoading, error, mutate: mutateOpen } = useThreads('open', initialOpenThreads)
  const { threads: closedThreads, isLoading: closedLoading, mutate: mutateClosed } = useThreads('closed')
  const { data: integrations = [] } = useSWR<Integration[]>('/api/integrations', fetcher)
  const hasShopify = integrations.some(i => i.platform === 'shopify')

  const isSearchMode = searchQuery.length >= 2

  const dbThreads = isSearchMode ? [] : (activeTab === 'open' ? openThreads : closedThreads)
  const isLoading = activeTab === 'open' ? openLoading : closedLoading

  const filteredTickets: Ticket[] = useMemo(() => {
    if (isSearchMode) {
      const q = searchQuery.toLowerCase()
      return [...openThreads, ...closedThreads]
        .filter(t =>
          getCustomerName(t.customer).toLowerCase().includes(q) ||
          (t.tag ?? '').toLowerCase().includes(q) ||
          (t.aiSummary ?? '').toLowerCase().includes(q) ||
          t.messages.some(m => m.contentText?.toLowerCase().includes(q))
        )
        .map(threadToTicket)
    }
    return dbThreads
      .filter(t => !activeFilter || t.channelType === activeFilter)
      .map(threadToTicket)
  }, [isSearchMode, searchQuery, openThreads, closedThreads, dbThreads, activeFilter])

  const liveTickets: Ticket[] = isSearchMode
    ? filteredTickets
    : dbThreads.map(threadToTicket)

  const activeTicket = liveTickets.find(t => t.id === activeTicketId)
  const allThreads = isSearchMode ? [...openThreads, ...closedThreads] : dbThreads
  const activeThread = allThreads.find(t => t.id === activeTicketId)

  // Pre-select thread from ?thread= query param
  useEffect(() => {
    const threadId = searchParams.get('thread')
    if (!threadId) return
    if (openThreads.find(t => t.id === threadId)) {
      setActiveTab('open')
      setActiveTicketId(threadId)
    } else if (closedThreads.find(t => t.id === threadId)) {
      setActiveTab('closed')
      setActiveTicketId(threadId)
    }
  }, [searchParams, openThreads, closedThreads])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeTicket?.messages?.length, activeTicketId])

  const handleTabChange = (tab: 'open' | 'closed') => {
    setActiveTab(tab)
    setActiveTicketId(null)
    setSearchQuery('')
    setReplyText("")
    setSendError(null)
    setSelectedIds([])
  }

  const handleSearchChange = (q: string) => {
    setSearchQuery(q)
    setActiveTicketId(null)
    setSendError(null)
    if (!q) setSelectedIds([])
  }

  const handleSendMessage = async (noteMode: boolean) => {
    if (!replyText.trim() || !activeTicketId) return
    const textToSend = replyText
    setReplyText("")
    setIsSending(true)
    setSendError(null)

    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      threadId: activeTicketId,
      senderType: noteMode ? 'note' : 'agent',
      contentText: textToSend,
      mediaUrl: null,
      sentAt: new Date().toISOString()
    }

    const mutateFn = activeTab === 'open' ? mutateOpen : mutateClosed
    const currentThreads = activeTab === 'open' ? openThreads : closedThreads

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
        body: JSON.stringify({ threadId: activeTicketId, text: textToSend, isNote: noteMode })
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      mutateFn()
    } catch (err) {
      console.error("Failed to send message", err)
      setReplyText(textToSend)
      setSendError("Failed to send. Check your connection and try again.")
      mutateFn()
    } finally {
      setIsSending(false)
    }
  }

  const handleResolve = async () => {
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
      setResolveToast(true)
      setTimeout(() => setResolveToast(false), 2500)
    } catch (err) {
      console.error('Failed to resolve ticket', err)
    }
  }

  const handleReopen = async () => {
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
      setBulkToast('Ticket reopened')
      setTimeout(() => setBulkToast(null), 2500)
    } catch (err) {
      console.error('Failed to reopen ticket', err)
    }
  }

  const handleAiDraft = async () => {
    if (!activeTicketId) return
    setIsDrafting(true)
    setReplyText("Clerk is thinking...")
    try {
      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: activeTicketId })
      })
      const data = await res.json()
      setReplyText(data.draft || "Failed to generate draft. Please try typing manually.")
    } catch (err) {
      console.error("AI Draft Error:", err)
      setReplyText("Failed to generate draft. Please try typing manually.")
    } finally {
      setIsDrafting(false)
    }
  }

  const handleLinkShopifyCustomer = async (customerId: string | null) => {
    if (!activeTicketId) return
    const mutateFn = activeTab === 'open' ? mutateOpen : mutateClosed
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
  }

  const handleTagUpdate = async (tag: string) => {
    if (!activeTicketId) return
    const mutateFn = activeTab === 'open' ? mutateOpen : mutateClosed
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
  }

  const handleRefreshSummary = async () => {
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
      const mutateFn = activeTab === 'open' ? mutateOpen : mutateClosed
      if (data.summary) {
        await mutateFn(dbThreads.map(t =>
          t.id === activeTicketId ? { ...t, aiSummary: data.summary } : t
        ), false)
      } else {
        mutateFn()
      }
    } catch (err) {
      console.error("Network error:", err)
      setSendError("Network error: Failed to reach the AI endpoint.")
    } finally {
      setIsRefreshingSummary(false)
    }
  }

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }, [])

  const handleClearSelection = useCallback(() => setSelectedIds([]), [])

  const handleBulkClose = async () => {
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
      setBulkToast(`${ids.length} ticket${ids.length !== 1 ? 's' : ''} closed`)
      setTimeout(() => setBulkToast(null), 2500)
    } catch (err) {
      console.error('Bulk close failed', err)
    }
  }

  if (isLoading && dbThreads.length === 0 && !isSearchMode) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="text-slate-400 text-sm animate-pulse">Loading Clerk Inbox...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="text-red-500 text-sm font-medium">Failed to connect to database.</div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-white relative">

      {/* ── Col 1: Thread list ─────────────────────────────────────────────── */}
      <div className={`
        w-full md:w-72 md:min-w-[260px] md:max-w-[300px] shrink-0 border-r border-slate-200 flex-col bg-white
        ${activeTicketId ? 'hidden md:flex' : 'flex'}
      `}>
        <ThreadList
          tickets={filteredTickets}
          totalCount={liveTickets.length}
          activeTab={activeTab}
          activeFilter={activeFilter}
          activeTicketId={activeTicketId}
          openCount={openThreads.length}
          searchQuery={searchQuery}
          isSearchMode={isSearchMode}
          selectedIds={selectedIds}
          onSearchChange={handleSearchChange}
          onTabChange={handleTabChange}
          onFilterChange={setActiveFilter}
          onSelectTicket={id => { setActiveTicketId(id); setSendError(null) }}
          onToggleSelect={handleToggleSelect}
          onBulkClose={handleBulkClose}
          onClearSelection={handleClearSelection}
        />
      </div>

      {/* ── Col 2+3: Conversation + Context panel ──────────────────────────── */}
      <div className={`flex-1 flex min-w-0 ${!activeTicketId ? 'hidden md:flex' : 'flex'}`}>
        {activeTicket && activeThread ? (
          <>
            <ConversationView
              ticket={activeTicket}
              activeTab={isSearchMode ? (activeThread.status === 'closed' ? 'closed' : 'open') : activeTab}
              replyText={replyText}
              isNote={isNote}
              isDrafting={isDrafting}
              isSending={isSending}
              sendError={sendError}
              messagesEndRef={messagesEndRef}
              onBack={() => { setActiveTicketId(null); setSendError(null) }}
              onResolve={handleResolve}
              onReopen={handleReopen}
              onReplyChange={text => { setReplyText(text); if (sendError) setSendError(null) }}
              onSend={handleSendMessage}
              onDraft={handleAiDraft}
              onToggleNote={setIsNote}
            />
            <div className="hidden lg:flex">
              <ContextPanel
                thread={activeThread}
                ticket={activeTicket}
                hasShopify={hasShopify}
                isRefreshingSummary={isRefreshingSummary}
                onRefreshSummary={handleRefreshSummary}
                onTagUpdate={handleTagUpdate}
                onLinkShopifyCustomer={handleLinkShopifyCustomer}
                onAgentActionsComplete={() => { mutateOpen(); mutateClosed() }}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/60 p-6 text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
              {activeTab === 'open' && openThreads.length === 0
                ? <CheckCircle2 className="w-6 h-6 text-green-400" />
                : <Inbox className="w-6 h-6 text-slate-300" />
              }
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {activeTab === 'open' && openThreads.length === 0 ? 'All caught up' : 'No conversation open'}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
                {activeTab === 'open' && openThreads.length === 0
                  ? 'No open tickets right now. Check back soon.'
                  : 'Select a thread from the list to start replying.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Resolve toast */}
      {resolveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          Ticket resolved
        </div>
      )}

      {/* Bulk action toast */}
      {bulkToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          {bulkToast}
        </div>
      )}
    </div>
  )
}
