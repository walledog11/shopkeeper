"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Inbox } from "lucide-react"
import useSWR from 'swr'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { usePaginatedThreads } from '@/hooks/useThreads'
import { useAgentTurns } from '@/hooks/useAgentTurns'
import { useTicketActions } from '@/hooks/useTicketActions'
import { useTicketSelection } from '@/hooks/useTicketSelection'
import { threadToTicket } from '@/lib/utils'
import { fetcher } from '@/lib/fetcher'
import ThreadList from './ThreadList'
import ConversationView from './conversation/ConversationView'
import ContextPanel from './ContextPanel'
import type { Thread, Ticket, ChannelType, AgentPlan } from '@/types'

// Module-level cache — persists across navigation for the browser session
const planCache = new Map<string, AgentPlan | null>()

interface Props {
  initialOpenThreads: Thread[]
  hasShopify: boolean
  agentName: string
}

export default function TicketsPageClient({ initialOpenThreads, hasShopify, agentName }: Props) {
  const searchParams = useSearchParams()

  const [activeFilter, setActiveFilter] = useState<ChannelType | null>(null)
  const [activeTab, setActiveTab] = useState<'open' | 'closed'>('open')
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showContextDrawer, setShowContextDrawer] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { threads: openThreads, isLoading: openLoading, error, mutate: mutateOpen, loadMore: loadMoreOpen, hasMore: hasMoreOpen, isLoadingMore: isLoadingMoreOpen } = usePaginatedThreads('open', initialOpenThreads)
  const { threads: closedThreads, isLoading: closedLoading, mutate: mutateClosed, loadMore: loadMoreClosed, hasMore: hasMoreClosed, isLoadingMore: isLoadingMoreClosed } = usePaginatedThreads('closed')
  const isSearchMode = searchQuery.length >= 2
  const dbThreads = isSearchMode ? [] : (activeTab === 'open' ? openThreads : closedThreads)
  const isLoading = activeTab === 'open' ? openLoading : closedLoading

  const { data: searchData, isLoading: isSearchLoading } = useSWR<{ threads: Thread[] }>(
    isSearchMode ? `/api/search?q=${encodeURIComponent(searchQuery)}` : null,
    fetcher,
    { keepPreviousData: true },
  )
  const searchThreads = searchData?.threads ?? []

  const filteredTickets: Ticket[] = useMemo(() => {
    if (isSearchMode) {
      return searchThreads.map(t => threadToTicket(t, agentName))
    }
    return dbThreads
      .filter(t => !activeFilter || t.channelType === activeFilter)
      .map(t => threadToTicket(t, agentName))
  }, [isSearchMode, searchThreads, dbThreads, activeFilter, agentName])

  const liveTickets: Ticket[] = useMemo(
    () => isSearchMode ? filteredTickets : dbThreads.map(t => threadToTicket(t, agentName)),
    [isSearchMode, filteredTickets, dbThreads, agentName]
  )

  const activeTicket = liveTickets.find(t => t.id === activeTicketId)
  const allThreads = isSearchMode ? searchThreads : dbThreads
  const activeThread = allThreads.find(t => t.id === activeTicketId)

  const lastCustomerMessageId = activeThread?.messages
    .filter(m => m.senderType === 'customer')
    .at(-1)?.id ?? null
  const planCacheKey = activeTicketId && lastCustomerMessageId
    ? `${activeTicketId}:${lastCustomerMessageId}`
    : null
  const cachedPlan = planCacheKey !== null
    ? planCache.get(planCacheKey)
    : undefined

  const { selectedIds, setSelectedIds, handleToggleSelect, handleClearSelection } = useTicketSelection()

  const {
    replyText, setReplyText,
    isDrafting, isSending, sendError, setSendError,
    isRefreshingSummary, toast,
    failedMessages, handleRetry,
    handleSendMessage, handleResolve, handleReopen,
    handleAiDraft, handleLinkShopifyCustomer, handleTagUpdate,
    handleRefreshSummary, handleBulkClose, handleBulkArchive, handleBulkTag,
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
      <div className="flex h-full w-full overflow-hidden bg-background">
        <div className="w-full md:w-72 md:min-w-[260px] md:max-w-[300px] shrink-0 border-r border-border flex flex-col bg-background">
          <div className="px-3 pt-3 pb-2 border-b border-border space-y-2">
            <div className="h-9 bg-white/[0.04] rounded-md animate-pulse" />
            <div className="h-8 bg-white/[0.04] rounded-md animate-pulse" />
            <div className="h-9 bg-white/[0.04] rounded-md animate-pulse" />
          </div>
          <div className="flex-1 divide-y divide-white/[0.05]">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="px-4 py-3.5 animate-pulse space-y-2">
                <div className="flex justify-between">
                  <div className="h-3 w-24 bg-white/[0.06] rounded" />
                  <div className="h-3 w-10 bg-white/[0.04] rounded" />
                </div>
                <div className="h-3 w-40 bg-white/[0.05] rounded" />
                <div className="h-3 w-32 bg-white/[0.04] rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="hidden md:flex flex-1 items-center justify-center bg-background">
          <div className="w-14 h-14 rounded-md bg-white/[0.05] border border-border flex items-center justify-center">
            <Inbox className="w-6 h-6 text-white/20" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="text-red-400 text-sm font-medium">Failed to connect to database.</div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background relative">

      {/* ── Col 1: Thread list ─────────────────────────────────────────────── */}
      <div className={`
        w-full md:w-72 md:min-w-[260px] md:max-w-[300px] shrink-0 border-r border-border flex-col bg-background
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
          isSearchLoading={isSearchLoading}
          selectedIds={selectedIds}
          onSearchChange={handleSearchChange}
          onTabChange={handleTabChange}
          onFilterChange={setActiveFilter}
          onSelectTicket={id => { setActiveTicketId(id); setSendError(null) }}
          onToggleSelect={handleToggleSelect}
          onBulkClose={() => handleBulkClose(selectedIds)}
          onBulkArchive={() => handleBulkArchive(selectedIds)}
          onBulkTag={(tag) => handleBulkTag(selectedIds, tag)}
          onClearSelection={handleClearSelection}
          hasMore={activeTab === 'open' ? hasMoreOpen : hasMoreClosed}
          isLoadingMore={activeTab === 'open' ? isLoadingMoreOpen : isLoadingMoreClosed}
          onLoadMore={activeTab === 'open' ? loadMoreOpen : loadMoreClosed}
        />
      </div>

      {/* ── Col 2+3: Conversation + Context panel ──────────────────────────── */}
      <div className={`flex-1 flex min-w-0 ${!activeTicketId ? 'hidden md:flex' : 'flex'}`}>
        {activeTicket && activeThread ? (
          <>
            <ConversationView
              key={activeTicket.id}
              ticket={activeTicket}
              agentName={agentName}
              shopifyCustomerId={activeThread.shopifyCustomerId}
              customerPlatformId={activeThread.customer?.platformId}
              agentTurns={activeAgentTurns}
              isAgentRunning={isAgentRunning}
              onAgentTurnAdd={handleAgentTurnAdd}
              onAgentRunningChange={handleAgentRunningChange}
              onAgentComplete={handleAgentComplete}
              activeTab={isSearchMode ? (activeThread.status === 'closed' ? 'closed' : 'open') : activeTab}
              planRevisionKey={planCacheKey}
              initialPlan={cachedPlan}
              onPlanCached={(plan) => { if (planCacheKey) planCache.set(planCacheKey, plan) }}
              replyText={replyText}
              isDrafting={isDrafting}
              isSending={isSending}
              sendError={sendError}
              messagesEndRef={messagesEndRef}
              failedMessages={failedMessages.filter(m => m.threadId === activeTicketId)}
              onRetry={handleRetry}
              onOpenContext={() => setShowContextDrawer(true)}
              onBack={() => { setActiveTicketId(null); setSendError(null); setShowContextDrawer(false) }}
              onResolve={handleResolve}
              onReopen={handleReopen}
              onReplyChange={text => { setReplyText(text); if (sendError) setSendError(null) }}
              onSend={handleSendMessage}
              onDraft={handleAiDraft}
            />
            {/* Desktop context panel */}
            <div className="hidden xl:flex">
              <ContextPanel
                thread={activeThread}
                hasShopify={hasShopify}
                aiSummary={activeTicket.aiSummary}
                isRefreshingSummary={isRefreshingSummary}
                onRefreshSummary={handleRefreshSummary}
                onTagUpdate={handleTagUpdate}
                onLinkShopifyCustomer={handleLinkShopifyCustomer}
              />
            </div>

            {/* Mobile/tablet context sheet */}
            <Sheet open={showContextDrawer} onOpenChange={setShowContextDrawer}>
              <SheetContent
                side="bottom"
                className="xl:hidden max-h-[82vh] flex flex-col p-0 rounded-t-xl border-border gap-0"
              >
                <SheetHeader className="px-5 py-3 border-b border-border shrink-0">
                  <SheetTitle className="text-sm font-semibold text-white/70 text-left">Customer Details</SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto">
                  <ContextPanel
                    thread={activeThread}
                    hasShopify={hasShopify}
                    aiSummary={activeTicket.aiSummary}
                    isRefreshingSummary={isRefreshingSummary}
                    onRefreshSummary={handleRefreshSummary}
                    onTagUpdate={handleTagUpdate}
                    onLinkShopifyCustomer={handleLinkShopifyCustomer}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-background p-6 text-center gap-4">
            <div className="w-14 h-14 rounded-md bg-white/[0.05] border border-border flex items-center justify-center">
              {activeTab === 'open' && openThreads.length === 0
                ? <CheckCircle2 className="w-6 h-6 text-green-400" />
                : <Inbox className="w-6 h-6 text-white/20" />
              }
            </div>
            <div>
              <p className="text-sm font-semibold text-white/60">
                {activeTab === 'open' && openThreads.length === 0 ? 'All caught up' : 'No conversation open'}
              </p>
              <p className="text-xs text-white/30 mt-1 max-w-[200px]">
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#1c1c1c] border border-white/[0.10] text-white text-sm font-medium px-4 py-2.5 rounded-md shadow-lg pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          {toast}
        </div>
      )}
    </div>
  )
}
