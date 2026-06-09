"use client"

import { Suspense, useState, useRef, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { AlertCircle, CheckCircle2, Inbox } from "lucide-react"
import useSWR from 'swr'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useActiveThreadSelection } from '../_hooks/useActiveThreadSelection'
import { useAgentTurns } from '../_hooks/useAgentTurns'
import { usePaginatedThreads } from '../_hooks/usePaginatedThreads'
import { useSummaryRefresh } from '../_hooks/useSummaryRefresh'
import { useTicketActions } from '../_hooks/useTicketActions'
import { useTicketSelection } from '../_hooks/useTicketSelection'
import { useThreadCacheCoordinator } from '../_hooks/useThreadCacheCoordinator'
import { threadToTicket } from '../_lib/thread-to-ticket'
import { fetcher } from '@/lib/api/fetcher'
import ThreadList from './thread-list/ThreadList'
import ConversationView from './conversation/ConversationView'
import ContextPanel from './context-panel/ContextPanel'
import ContextPanelSkeleton from './context-panel/ContextPanelSkeleton'
import { getCurrentPlanForThread } from '@shopkeeper/agent/plan-cache-shape'
import type { Thread, Ticket, ChannelType } from '@/types'

interface Props {
  initialOpenThreads: Thread[]
  hasShopify: boolean
  agentName: string
}

const EMPTY_SEARCH_THREADS: Thread[] = []

export default function TicketsPageClient(props: Props) {
  return (
    <Suspense fallback={null}>
      <TicketsPageContent {...props} />
    </Suspense>
  )
}

function TicketsPageContent({ initialOpenThreads, hasShopify, agentName }: Props) {
  const searchParams = useSearchParams()
  const queryThreadId = searchParams.get('thread')

  const [activeFilter, setActiveFilter] = useState<ChannelType | null>(null)
  const [activeTab, setActiveTab] = useState<'open' | 'closed' | 'filtered'>('open')
  const [needsReply, setNeedsReply] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showContextDrawer, setShowContextDrawer] = useState(false)
  const isDesktopContext = useMediaQuery('(min-width: 1280px)')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { threads: openThreads, isLoading: openLoading, error, mutate: mutateOpen, removeThreadById: removeFromOpen, prependThread: prependToOpen, loadMore: loadMoreOpen, hasMore: hasMoreOpen, isLoadingMore: isLoadingMoreOpen } = usePaginatedThreads('open', initialOpenThreads, true, undefined, needsReply)
  const { threads: closedThreads, isLoading: closedLoading, mutate: mutateClosed, removeThreadById: removeFromClosed, prependThread: prependToClosed, loadMore: loadMoreClosed, hasMore: hasMoreClosed, isLoadingMore: isLoadingMoreClosed } = usePaginatedThreads('closed', undefined, true)
  const { threads: filteredThreads, isLoading: filteredLoading, mutate: mutateFiltered, removeThreadById: removeFromFiltered, prependThread: prependToFiltered, loadMore: loadMoreFiltered, hasMore: hasMoreFiltered, isLoadingMore: isLoadingMoreFiltered } = usePaginatedThreads('open', undefined, true, 'filtered')
  const isSearchMode = searchQuery.length >= 2

  const { data: searchData, isLoading: isSearchLoading, mutate: mutateSearch } = useSWR<{ threads: Thread[] }>(
    isSearchMode ? `/api/search?q=${encodeURIComponent(searchQuery)}` : null,
    fetcher,
    { keepPreviousData: true },
  )
  const searchThreads = searchData?.threads ?? EMPTY_SEARCH_THREADS

  const {
    activeTicketId,
    setActiveTicketId,
    activeThread,
    activeThreadData,
    activeThreadError,
    activeThreadPreview,
    activeTicket,
    conversationTicket,
    effectiveActiveTab,
    isConversationLoading,
    mutateActiveThread,
  } = useActiveThreadSelection({
    queryThreadId,
    activeTab,
    openThreads,
    closedThreads,
    filteredThreads,
    searchThreads,
    agentName,
  })

  const dbThreads = useMemo(
    () => {
      if (isSearchMode) return []
      if (effectiveActiveTab === 'open') return openThreads
      if (effectiveActiveTab === 'closed') return closedThreads
      return filteredThreads
    },
    [closedThreads, effectiveActiveTab, filteredThreads, isSearchMode, openThreads],
  )
  const isLoading = effectiveActiveTab === 'open' ? openLoading : effectiveActiveTab === 'closed' ? closedLoading : filteredLoading

  const listThreads = isSearchMode ? searchThreads : dbThreads

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

  const lastCustomerMessageId = useMemo(
    () => activeThread?.messages.filter(m => m.senderType === 'customer').at(-1)?.id ?? null,
    [activeThread?.messages],
  )
  const cachedPlanMessageId = activeThread?.cachedPlanMessageId ?? null
  // Key memo on cachedPlanMessageId (content fingerprint) rather than the cachedPlan
  // ref, which churns on every SWR poll and would re-fire downstream effects.
  const cachedPlan = useMemo(
    () => activeThread ? getCurrentPlanForThread(activeThread, lastCustomerMessageId) : null,
    [activeThread, lastCustomerMessageId],
  )

  const {
    patchThreadCaches,
    moveThreadStatus,
    moveThreadFilterStatus,
    revalidateThreadCaches,
  } = useThreadCacheCoordinator({
    openThreads,
    closedThreads,
    filteredThreads,
    activeThread: activeThreadData?.thread,
    mutateOpen,
    mutateClosed,
    mutateFiltered,
    removeFromOpen,
    removeFromClosed,
    removeFromFiltered,
    prependToOpen,
    prependToClosed,
    prependToFiltered,
    mutateSearch,
    mutateActiveThread,
  })

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
    showToast,
  } = useTicketActions({
    activeTicketId,
    patchThreadCaches,
    revalidateThreadCaches,
    moveThreadStatus,
    moveThreadFilterStatus,
    setActiveTicketId,
    setSelectedIds,
  })

  const {
    activeAgentTurns, isAgentRunning,
    handleAgentTurnAdd, handleAgentRunningChange, handleAgentComplete,
  } = useAgentTurns({
    activeTicketId,
    activeThread,
    agentActionsByTurnId: activeThreadData?.agentActionsByTurnId,
    patchThreadCaches,
    revalidateThreadCaches,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeTicket?.messages?.length, activeTicketId])

  const { refreshingSummaryId, handleRefreshSummary } = useSummaryRefresh({
    patchThreadCaches,
    showToast,
  })

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
      <div className="flex size-full overflow-hidden bg-background">
        <div className="w-full md:w-72 md:min-w-[260px] md:max-w-[300px] shrink-0 border-r border-border flex flex-col bg-background">
          <div className="px-3 pt-3 pb-2 border-b border-border space-y-2">
            <div className="h-9 bg-white/[0.04] rounded-md animate-pulse" />
            <div className="h-8 bg-white/[0.04] rounded-md animate-pulse" />
            <div className="h-9 bg-white/[0.04] rounded-md animate-pulse" />
          </div>
          <div className="flex-1 divide-y divide-white/[0.05]">
            {["ticket-skeleton-1", "ticket-skeleton-2", "ticket-skeleton-3", "ticket-skeleton-4", "ticket-skeleton-5", "ticket-skeleton-6"].map((key) => (
              <div key={key} className="px-4 py-3.5 animate-pulse space-y-2">
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
          <div className="size-14 rounded-md bg-white/[0.05] border border-border flex items-center justify-center">
            <Inbox className="size-6 text-white/20" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex size-full items-center justify-center bg-background">
        <div className="text-red-400 text-sm font-medium">Failed to connect to database.</div>
      </div>
    )
  }

  return (
    <div className="flex size-full overflow-hidden bg-background relative">

      {/* ── Col 1: Thread list ─────────────────────────────────────────────── */}
      <div className={`
        w-full md:w-72 md:min-w-[260px] md:max-w-[300px] shrink-0 border-r border-border flex-col bg-background
        ${activeTicketId ? 'hidden md:flex' : 'flex'}
      `}>
        <ThreadList
          tickets={filteredTickets}
          totalCount={liveTickets.length}
          activeTab={effectiveActiveTab}
          activeFilter={activeFilter}
          activeTicketId={activeTicketId}
          openCount={openThreads.length}
          closedCount={closedThreads.length}
          spamCount={filteredThreads.length}
          searchQuery={searchQuery}
          listState={{
            searchMode: isSearchMode,
            searchLoading: isSearchLoading,
            hasMore: effectiveActiveTab === 'open' ? hasMoreOpen : effectiveActiveTab === 'closed' ? hasMoreClosed : hasMoreFiltered,
            loadingMore: effectiveActiveTab === 'open' ? isLoadingMoreOpen : effectiveActiveTab === 'closed' ? isLoadingMoreClosed : isLoadingMoreFiltered,
          }}
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
          onLoadMore={effectiveActiveTab === 'open' ? loadMoreOpen : effectiveActiveTab === 'closed' ? loadMoreClosed : loadMoreFiltered}
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
              agentName={agentName}
              shopifyCustomerId={activeThread?.shopifyCustomerId}
              customerPlatformId={activeThread?.customer?.platformId}
              agentTurns={activeAgentTurns}
              status={{
                threadLoading: isConversationLoading,
                sending: isSending,
                agentRunning: isAgentRunning,
                summaryRefreshing: activeThread ? refreshingSummaryId === activeThread.id : false,
              }}
              onAgentTurnAdd={handleAgentTurnAdd}
              onAgentRunningChange={handleAgentRunningChange}
              onAgentComplete={handleAgentComplete}
              activeTab={isSearchMode || effectiveActiveTab === 'filtered'
                ? ((activeThread?.status ?? activeThreadPreview?.status) === 'closed' ? 'closed' : 'open')
                : effectiveActiveTab}
              initialPlan={cachedPlan}
              aiSummary={activeThread?.aiSummary ?? activeThreadPreview?.aiSummary ?? null}
              onRefreshSummary={() => {
                if (activeThread) {
                  handleRefreshSummary(activeThread.id)
                }
              }}
              replyText={replyText}
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
                <AlertCircle className="size-5 text-red-400" />
                <div>
                  <p className="text-sm font-semibold text-white/60">Unable to load conversation</p>
                  <p className="text-xs text-white/30 mt-1">The thread may have been archived or is no longer available.</p>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-background p-6 text-center gap-4">
            <div className="size-14 rounded-md bg-white/[0.05] border border-border flex items-center justify-center">
              {effectiveActiveTab === 'open' && openThreads.length === 0
                ? <CheckCircle2 className="size-6 text-green-400" />
                : <Inbox className="size-6 text-white/20" />
              }
            </div>
            <div>
              <p className="text-sm font-semibold text-white/60">
                {effectiveActiveTab === 'open' && openThreads.length === 0 ? 'All caught up' : 'No conversation open'}
              </p>
              <p className="text-xs text-white/30 mt-1 max-w-[200px]">
                {effectiveActiveTab === 'open' && openThreads.length === 0
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
            ? <AlertCircle className="size-4 text-red-400 shrink-0" />
            : <CheckCircle2 className="size-4 text-green-400 shrink-0" />
          }
          {toast.message}
        </div>
      )}
    </div>
  )
}
