"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { CheckCircle2, Inbox } from "lucide-react"
import { useThreads } from '@/hooks/useThreads'
import { useAgentTurns } from '@/hooks/useAgentTurns'
import { useTicketActions } from '@/hooks/useTicketActions'
import { useTicketSelection } from '@/hooks/useTicketSelection'
import { threadToTicket, getCustomerName } from '@/lib/utils'
import ThreadList from './ThreadList'
import ConversationView from './ConversationView'
import ContextPanel from './ContextPanel'
import type { Thread, Ticket, ChannelType } from '@/types'

interface Props {
  initialOpenThreads: Thread[]
  hasShopify: boolean
}

export default function TicketsPageClient({ initialOpenThreads, hasShopify }: Props) {
  const { user } = useUser()
  const agentName = user?.firstName || user?.fullName || 'You'
  const searchParams = useSearchParams()

  const [activeFilter, setActiveFilter] = useState<ChannelType | null>(null)
  const [activeTab, setActiveTab] = useState<'open' | 'closed'>('open')
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { threads: openThreads, isLoading: openLoading, error, mutate: mutateOpen } = useThreads('open', initialOpenThreads)
  const { threads: closedThreads, isLoading: closedLoading, mutate: mutateClosed } = useThreads('closed')
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
        .map(t => threadToTicket(t, agentName))
    }
    return dbThreads
      .filter(t => !activeFilter || t.channelType === activeFilter)
      .map(t => threadToTicket(t, agentName))
  }, [isSearchMode, searchQuery, openThreads, closedThreads, dbThreads, activeFilter, agentName])

  const liveTickets: Ticket[] = isSearchMode
    ? filteredTickets
    : dbThreads.map(t => threadToTicket(t, agentName))

  const activeTicket = liveTickets.find(t => t.id === activeTicketId)
  const allThreads = isSearchMode ? [...openThreads, ...closedThreads] : dbThreads
  const activeThread = allThreads.find(t => t.id === activeTicketId)

  const previousTicketsCount = useMemo(() => {
    if (!activeThread) return 0
    return [...openThreads, ...closedThreads].filter(
      t => t.customerId === activeThread.customerId && t.id !== activeTicketId
    ).length
  }, [activeThread, openThreads, closedThreads, activeTicketId])

  const { selectedIds, setSelectedIds, handleToggleSelect, handleClearSelection } = useTicketSelection()

  const {
    replyText, setReplyText,
    isDrafting, isSending, sendError, setSendError,
    isRefreshingSummary, toast,
    handleSendMessage, handleResolve, handleReopen,
    handleAiDraft, handleLinkShopifyCustomer, handleTagUpdate,
    handleRefreshSummary, handleBulkClose,
  } = useTicketActions({
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
  })

  const {
    activeAgentTurns, isAgentRunning,
    handleAgentTurnAdd, handleAgentRunningChange, handleAgentComplete,
  } = useAgentTurns({
    activeTicketId,
    activeTab,
    activeThread,
    mutateOpen,
    mutateClosed,
    openThreads,
    closedThreads,
  })

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeTicket?.messages?.length, activeTicketId])

  const handleTabChange = (tab: 'open' | 'closed') => {
    setActiveTab(tab)
    setActiveTicketId(null)
    setSearchQuery('')
    setReplyText('')
    setSendError(null)
    setSelectedIds([])
  }

  const handleSearchChange = (q: string) => {
    setSearchQuery(q)
    setActiveTicketId(null)
    setSendError(null)
    if (!q) setSelectedIds([])
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
          onBulkClose={() => handleBulkClose(selectedIds)}
          onClearSelection={handleClearSelection}
        />
      </div>

      {/* ── Col 2+3: Conversation + Context panel ──────────────────────────── */}
      <div className={`flex-1 flex min-w-0 ${!activeTicketId ? 'hidden md:flex' : 'flex'}`}>
        {activeTicket && activeThread ? (
          <>
            <ConversationView
              key={activeTicket.id}
              ticket={activeTicket}
              agentTurns={activeAgentTurns}
              isAgentRunning={isAgentRunning}
              isRefreshingSummary={isRefreshingSummary}
              onAgentTurnAdd={handleAgentTurnAdd}
              onAgentRunningChange={handleAgentRunningChange}
              onAgentComplete={handleAgentComplete}
              onRefreshSummary={handleRefreshSummary}
              activeTab={isSearchMode ? (activeThread.status === 'closed' ? 'closed' : 'open') : activeTab}
              replyText={replyText}
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
            />
            <div className="hidden lg:flex">
              <ContextPanel
                thread={activeThread}
                hasShopify={hasShopify}
                onTagUpdate={handleTagUpdate}
                onLinkShopifyCustomer={handleLinkShopifyCustomer}
                previousTicketsCount={previousTicketsCount}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/60 p-6 text-center gap-4">
            <div className="w-14 h-14 rounded-md bg-white border border-slate-200 shadow-sm flex items-center justify-center">
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-md shadow-lg pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          {toast}
        </div>
      )}
    </div>
  )
}
