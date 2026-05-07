"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { AlertCircle, CheckCircle2, Inbox } from "lucide-react"
import useSWR from 'swr'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useAgentTurns } from '../_hooks/useAgentTurns'
import { usePaginatedThreads } from '../_hooks/usePaginatedThreads'
import { useTicketActions } from '../_hooks/useTicketActions'
import { useTicketSelection } from '../_hooks/useTicketSelection'
import { threadToTicket } from '../_lib/thread-to-ticket'
import { fetcher } from '@/lib/api/fetcher'
import ThreadList from './thread-list/ThreadList'
import ConversationView from './conversation/ConversationView'
import ContextPanel from './context-panel/ContextPanel'
import ContextPanelSkeleton from './context-panel/ContextPanelSkeleton'
import { getCurrentPlanForThread } from '@/lib/agent/plan-cache-shape'
import type { Thread, Ticket, ChannelType } from '@/types'

interface Props {
  initialOpenThreads: Thread[]
  hasShopify: boolean
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

export default function TicketsPageClient({ initialOpenThreads, hasShopify, agentName }: Props) {
  const searchParams = useSearchParams()
  const queryThreadId = searchParams.get('thread')

  const [activeFilter, setActiveFilter] = useState<ChannelType | null>(null)
  const [activeTab, setActiveTab] = useState<'open' | 'closed' | 'filtered'>('open')
  const [needsReply, setNeedsReply] = useState(false)
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showContextDrawer, setShowContextDrawer] = useState(false)
  const [refreshingSummaryId, setRefreshingSummaryId] = useState<string | null>(null)
  const summaryRequestsRef = useRef(new Set<string>())
  const appliedQueryThreadRef = useRef<string | null>(null)
  const isDesktopContext = useMediaQuery('(min-width: 1280px)')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { threads: openThreads, isLoading: openLoading, error, mutate: mutateOpen, loadMore: loadMoreOpen, hasMore: hasMoreOpen, isLoadingMore: isLoadingMoreOpen } = usePaginatedThreads('open', initialOpenThreads, true, undefined, needsReply)
  const { threads: closedThreads, isLoading: closedLoading, mutate: mutateClosed, loadMore: loadMoreClosed, hasMore: hasMoreClosed, isLoadingMore: isLoadingMoreClosed } = usePaginatedThreads('closed', undefined, true)
  const { threads: filteredThreads, isLoading: filteredLoading, mutate: mutateFiltered, loadMore: loadMoreFiltered, hasMore: hasMoreFiltered, isLoadingMore: isLoadingMoreFiltered } = usePaginatedThreads('open', undefined, true, 'filtered')
  const isSearchMode = searchQuery.length >= 2
  const dbThreads = useMemo(
    () => {
      if (isSearchMode) return []
      if (activeTab === 'open') return openThreads
      if (activeTab === 'closed') return closedThreads
      return filteredThreads
    },
    [activeTab, closedThreads, filteredThreads, isSearchMode, openThreads],
  )
  const isLoading = activeTab === 'open' ? openLoading : activeTab === 'closed' ? closedLoading : filteredLoading

  const { data: searchData, isLoading: isSearchLoading, mutate: mutateSearch } = useSWR<{ threads: Thread[] }>(
    isSearchMode ? `/api/search?q=${encodeURIComponent(searchQuery)}` : null,
    fetcher,
    { keepPreviousData: true },
  )
  const searchThreads = useMemo(() => searchData?.threads ?? [], [searchData?.threads])
  const activeThreadKey = activeTicketId ? `/api/threads/${activeTicketId}` : null
  const {
    data: activeThreadData,
    error: activeThreadError,
    mutate: mutateActiveThread,
  } = useSWR<{ thread: Thread }>(activeThreadKey, fetcher)

  const listThreads = useMemo(
    () => isSearchMode ? searchThreads : dbThreads,
    [dbThreads, isSearchMode, searchThreads],
  )

  const liveTickets: Ticket[] = useMemo(
    () => listThreads.map(t => threadToTicket(t, agentName)),
    [listThreads, agentName],
  )

  const filteredTickets: Ticket[] = useMemo(
    () => isSearchMode
      ? liveTickets
      : liveTickets.filter(t => !activeFilter || t.channelType === activeFilter),
    [activeFilter, isSearchMode, liveTickets],
  )

  const activeThread = activeThreadData?.thread
  const activeTicket = activeThread ? threadToTicket(activeThread, agentName) : undefined
  const activeThreadPreview = useMemo(
    () => {
      if (!activeTicketId) return undefined
      return openThreads.find(t => t.id === activeTicketId)
        ?? closedThreads.find(t => t.id === activeTicketId)
        ?? filteredThreads.find(t => t.id === activeTicketId)
        ?? searchThreads.find(t => t.id === activeTicketId)
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

  const lastCustomerMessageId = useMemo(
    () => activeThread?.messages.filter(m => m.senderType === 'customer').at(-1)?.id ?? null,
    [activeThread?.messages],
  )
  const cachedPlanMessageId = activeThread?.cachedPlanMessageId ?? null
  // Key memo on cachedPlanMessageId (content fingerprint) rather than the cachedPlan
  // ref, which churns on every SWR poll and would re-fire downstream effects.
  const cachedPlan = useMemo(
    () => activeThread ? getCurrentPlanForThread(activeThread, lastCustomerMessageId) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeThread?.id, cachedPlanMessageId, lastCustomerMessageId],
  )

  const patchThreadCaches = useCallback(async (threadId: string, updateThread: (thread: Thread) => Thread) => {
    const updateIfMatch = (thread: Thread): Thread =>
      thread.id === threadId ? updateThread(thread) : thread

    await Promise.all([
      mutateOpen(openThreads.map(updateIfMatch), false),
      mutateClosed(closedThreads.map(updateIfMatch), false),
      mutateFiltered(filteredThreads.map(updateIfMatch), false),
      mutateSearch(
        current => current
          ? { ...current, threads: current.threads.map(updateIfMatch) }
          : current,
        { revalidate: false },
      ),
      mutateActiveThread(
        current => current?.thread.id === threadId
          ? { ...current, thread: updateThread(current.thread) }
          : current,
        { revalidate: false },
      ),
    ])
  }, [closedThreads, filteredThreads, mutateActiveThread, mutateClosed, mutateFiltered, mutateOpen, mutateSearch, openThreads])

  const revalidateThreadCaches = useCallback(async () => {
    await Promise.all([
      mutateOpen(),
      mutateClosed(),
      mutateFiltered(),
      mutateSearch(),
      mutateActiveThread(),
    ])
  }, [mutateActiveThread, mutateClosed, mutateFiltered, mutateOpen, mutateSearch])

  const { selectedIds, setSelectedIds, handleToggleSelect, handleClearSelection } = useTicketSelection()

  const {
    replyText, setReplyText,
    isSending, sendError, setSendError,
    toast,
    failedMessages, handleRetry,
    handleSendMessage, handleResolve, handleReopen,
    handleLinkShopifyCustomer,
    handleBulkClose, handleBulkArchive, handleBulkTag,
    handleMarkAsSpam, handleRecover,
  } = useTicketActions({
    activeTicketId,
    patchThreadCaches,
    revalidateThreadCaches,
    setActiveTab,
    setActiveTicketId,
    setSelectedIds,
  })

  const {
    activeAgentTurns, isAgentRunning,
    handleAgentTurnAdd, handleAgentRunningChange, handleAgentComplete,
  } = useAgentTurns({
    activeTicketId,
    activeThread,
    patchThreadCaches,
    revalidateThreadCaches,
  })

  // Pre-select thread from ?thread= query param, fetching details even when the
  // thread is not in the currently loaded list page.
  useEffect(() => {
    if (!queryThreadId) {
      appliedQueryThreadRef.current = null
      return
    }
    if (appliedQueryThreadRef.current === queryThreadId) return
    appliedQueryThreadRef.current = queryThreadId
    setActiveTicketId(current => current === queryThreadId ? current : queryThreadId)
    if (openThreads.find(t => t.id === queryThreadId)) {
      setActiveTab('open')
    } else if (closedThreads.find(t => t.id === queryThreadId)) {
      setActiveTab('closed')
    } else if (filteredThreads.find(t => t.id === queryThreadId)) {
      setActiveTab('filtered')
    }
  }, [queryThreadId, openThreads, closedThreads, filteredThreads])

  useEffect(() => {
    if (!queryThreadId || activeThread?.id !== queryThreadId) return
    if (activeThread.filterStatus === 'filtered') {
      setActiveTab('filtered')
    } else {
      setActiveTab(activeThread.status === 'closed' ? 'closed' : 'open')
    }
  }, [activeThread?.filterStatus, activeThread?.id, activeThread?.status, queryThreadId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeTicket?.messages?.length, activeTicketId])

  const patchThreadSummary = useCallback(async (threadId: string, summary: string | null) => {
    await patchThreadCaches(threadId, thread => ({ ...thread, aiSummary: summary }))
  }, [patchThreadCaches])

  const handleRefreshSummary = useCallback(async (threadId: string) => {
    if (refreshingSummaryId === threadId) return
    setRefreshingSummaryId(threadId)

    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || `Server error: ${res.status}`)
      }

      await patchThreadSummary(threadId, data.summary ?? null)
    } catch (err) {
      summaryRequestsRef.current.delete(threadId)
      console.error('Failed to refresh summary', err)
    } finally {
      setRefreshingSummaryId(current => current === threadId ? null : current)
    }
  }, [patchThreadSummary, refreshingSummaryId])

  useEffect(() => {
    if (!activeThread || activeThread.aiSummary || activeThread.messages.length === 0) return
    if (summaryRequestsRef.current.has(activeThread.id)) return

    summaryRequestsRef.current.add(activeThread.id)
    handleRefreshSummary(activeThread.id)
  }, [activeThread, handleRefreshSummary])

  const handleTabChange = (tab: 'open' | 'closed' | 'filtered') => {
    setActiveTab(tab)
    setActiveTicketId(null)
    setSearchQuery('')
    setReplyText('')
    setSendError(null)
    setSelectedIds([])
    if (tab !== 'open') setNeedsReply(false)
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
          closedCount={closedThreads.length}
          spamCount={filteredThreads.length}
          searchQuery={searchQuery}
          isSearchMode={isSearchMode}
          isSearchLoading={isSearchLoading}
          selectedIds={selectedIds}
          needsReply={needsReply}
          onNeedsReplyChange={setNeedsReply}
          onSearchChange={handleSearchChange}
          onTabChange={handleTabChange}
          onFilterChange={setActiveFilter}
          onSelectTicket={id => { setActiveTicketId(id); setSendError(null) }}
          onToggleSelect={handleToggleSelect}
          onBulkClose={() => handleBulkClose(selectedIds)}
          onBulkArchive={() => handleBulkArchive(selectedIds)}
          onBulkTag={(tag) => handleBulkTag(selectedIds, tag)}
          onClearSelection={handleClearSelection}
          hasMore={activeTab === 'open' ? hasMoreOpen : activeTab === 'closed' ? hasMoreClosed : hasMoreFiltered}
          isLoadingMore={activeTab === 'open' ? isLoadingMoreOpen : activeTab === 'closed' ? isLoadingMoreClosed : isLoadingMoreFiltered}
          onLoadMore={activeTab === 'open' ? loadMoreOpen : activeTab === 'closed' ? loadMoreClosed : loadMoreFiltered}
          onMarkAsSpam={handleMarkAsSpam}
          onRecover={handleRecover}
        />
      </div>

      {/* ── Col 2+3: Conversation + Context panel ──────────────────────────── */}
      <div className={`flex-1 flex min-w-0 overflow-hidden ${!activeTicketId ? 'hidden md:flex' : 'flex'}`}>
        {conversationTicket ? (
          <>
            <ConversationView
              key={conversationTicket.id}
              ticket={conversationTicket}
              isThreadLoading={isConversationLoading}
              agentName={agentName}
              shopifyCustomerId={activeThread?.shopifyCustomerId}
              customerPlatformId={activeThread?.customer?.platformId}
              agentTurns={activeAgentTurns}
              isAgentRunning={isAgentRunning}
              onAgentTurnAdd={handleAgentTurnAdd}
              onAgentRunningChange={handleAgentRunningChange}
              onAgentComplete={handleAgentComplete}
              activeTab={isSearchMode || activeTab === 'filtered'
                ? ((activeThread?.status ?? activeThreadPreview?.status) === 'closed' ? 'closed' : 'open')
                : activeTab}
              initialPlan={cachedPlan}
              aiSummary={activeThread?.aiSummary ?? activeThreadPreview?.aiSummary ?? null}
              isSummaryRefreshing={activeThread ? refreshingSummaryId === activeThread.id : false}
              onRefreshSummary={() => {
                if (activeThread) {
                  handleRefreshSummary(activeThread.id)
                }
              }}
              replyText={replyText}
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
            />
            {/* Desktop context panel */}
            {isDesktopContext && (
              <div className="hidden xl:flex">
                {activeThread && !isConversationLoading ? (
                  <ContextPanel
                    thread={activeThread}
                    hasShopify={hasShopify}
                    onLinkShopifyCustomer={handleLinkShopifyCustomer}
                  />
                ) : (
                  <ContextPanelSkeleton hasShopify={hasShopify} />
                )}
              </div>
            )}

            {/* Mobile/tablet context sheet */}
            {activeThread && !isConversationLoading && (
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
                      onLinkShopifyCustomer={handleLinkShopifyCustomer}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </>
        ) : activeTicketId ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-background p-6 text-center gap-3">
            {activeThreadError ? (
              <>
                <AlertCircle className="w-5 h-5 text-red-400" />
                <div>
                  <p className="text-sm font-semibold text-white/60">Unable to load conversation</p>
                  <p className="text-xs text-white/30 mt-1">The thread may have been archived or is no longer available.</p>
                </div>
              </>
            ) : null}
          </div>
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
          {toast.tone === 'error'
            ? <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            : <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          }
          {toast.message}
        </div>
      )}
    </div>
  )
}
