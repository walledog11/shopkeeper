"use client"

import { Suspense, useReducer, useRef, useEffect, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Inbox } from "lucide-react"
import useSWR from 'swr'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useActiveThreadSelection } from '../_hooks/useActiveThreadSelection'
import { useAgentTurns } from '../_hooks/useAgentTurns'
import { usePaginatedThreads } from '../_hooks/usePaginatedThreads'
import { useTicketTabCounts } from '../_hooks/useTicketTabCounts'
import { useOpenThreadCountOverride } from '@/hooks/OpenThreadCountContext'
import { useSummaryRefresh } from '../_hooks/useSummaryRefresh'
import { useTicketActions } from '../_hooks/useTicketActions'
import { useTicketSelection } from '../_hooks/useTicketSelection'
import { useThreadCacheCoordinator } from '../_hooks/useThreadCacheCoordinator'
import { threadToTicket } from '../_lib/thread-to-ticket'
import { fetcher } from '@/lib/api/fetcher'
import { TicketsPageLayout } from './TicketsPageLayout'
import { getCurrentPlanForThread } from '@shopkeeper/agent/plan-cache-shape'
import type { Thread, Ticket, ChannelType } from '@/types'

interface Props {
  initialOpenThreads: Thread[]
  hasShopify: boolean
  agentName: string
}

const EMPTY_SEARCH_THREADS: Thread[] = []
const TICKET_SKELETON_KEYS = [
  "ticket-skeleton-1",
  "ticket-skeleton-2",
  "ticket-skeleton-3",
  "ticket-skeleton-4",
  "ticket-skeleton-5",
  "ticket-skeleton-6",
]

type TicketListTab = 'open' | 'closed' | 'filtered'

interface TicketsPageState {
  activeFilter: ChannelType | null
  activeTab: TicketListTab
  dismissCorrectHint: boolean
  needsReply: boolean
  searchQuery: string
  showContextDrawer: boolean
}

type TicketsPageAction =
  | { type: 'activeFilterChanged'; activeFilter: ChannelType | null }
  | { type: 'contextDrawerChanged'; open: boolean }
  | { type: 'correctHintDismissed' }
  | { type: 'needsReplyChanged'; needsReply: boolean }
  | { type: 'searchChanged'; searchQuery: string }
  | { type: 'tabChanged'; tab: TicketListTab }

const INITIAL_TICKETS_PAGE_STATE: TicketsPageState = {
  activeFilter: null,
  activeTab: 'open',
  dismissCorrectHint: false,
  needsReply: false,
  searchQuery: '',
  showContextDrawer: false,
}

function ticketsPageReducer(state: TicketsPageState, action: TicketsPageAction): TicketsPageState {
  switch (action.type) {
    case 'activeFilterChanged':
      return { ...state, activeFilter: action.activeFilter }
    case 'contextDrawerChanged':
      return { ...state, showContextDrawer: action.open }
    case 'correctHintDismissed':
      return { ...state, dismissCorrectHint: true }
    case 'needsReplyChanged':
      return { ...state, needsReply: action.needsReply }
    case 'searchChanged':
      return { ...state, searchQuery: action.searchQuery }
    case 'tabChanged':
      return {
        ...state,
        activeTab: action.tab,
        needsReply: action.tab === 'open' ? state.needsReply : false,
        searchQuery: '',
      }
  }
}

function renderTicketsLoadingState() {
  return (
    <div className="flex size-full overflow-hidden bg-background">
      <div className="w-full md:w-72 md:min-w-[260px] md:max-w-[300px] shrink-0 border-r border-border flex flex-col bg-background">
        <div className="px-3 pt-3 pb-2 border-b border-border space-y-2">
          <div className="h-9 bg-white/[0.04] rounded-md animate-pulse" />
          <div className="h-8 bg-white/[0.04] rounded-md animate-pulse" />
          <div className="h-9 bg-white/[0.04] rounded-md animate-pulse" />
        </div>
        <div className="flex-1 divide-y divide-white/[0.05]">
          {TICKET_SKELETON_KEYS.map((key) => (
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

function renderTicketsErrorState() {
  return (
    <div className="flex size-full items-center justify-center bg-background">
      <div className="text-red-400 text-sm font-medium">Failed to connect to database.</div>
    </div>
  )
}

export default function TicketsPageClient(props: Props) {
  return (
    <Suspense fallback={null}>
      <TicketsPageContent {...props} />
    </Suspense>
  )
}

function TicketsPageContent(props: Props) {
  const view = useTicketsPageView(props)
  if (view.kind === 'loading') return renderTicketsLoadingState()
  if (view.kind === 'error') return renderTicketsErrorState()
  return <TicketsPageLayout {...view.layoutProps} />
}

function useTicketsPageView({ initialOpenThreads, hasShopify, agentName }: Props) {
  const searchParams = useSearchParams()
  const queryThreadId = searchParams.get('thread')
  const correctReply = searchParams.get('correct') === '1'
  const [pageState, dispatchPageState] = useReducer(ticketsPageReducer, INITIAL_TICKETS_PAGE_STATE)
  const { activeFilter, activeTab, dismissCorrectHint, needsReply, searchQuery, showContextDrawer } = pageState
  const isDesktopContext = useMediaQuery('(min-width: 1280px)')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const openTabEnabled = activeTab === 'open'
  const closedTabEnabled = activeTab === 'closed'
  const filteredTabEnabled = activeTab === 'filtered'

  const {
    threads: openThreads,
    totalCount: openListTotalCount,
    isLoading: openLoading,
    error,
    mutate: mutateOpen,
    removeThreadById: removeFromOpen,
    prependThread: prependToOpen,
    loadMore: loadMoreOpen,
    hasMore: hasMoreOpen,
    isLoadingMore: isLoadingMoreOpen,
  } = usePaginatedThreads('open', initialOpenThreads, true, undefined, needsReply, openTabEnabled)
  const {
    threads: closedThreads,
    isLoading: closedLoading,
    mutate: mutateClosed,
    removeThreadById: removeFromClosed,
    prependThread: prependToClosed,
    loadMore: loadMoreClosed,
    hasMore: hasMoreClosed,
    isLoadingMore: isLoadingMoreClosed,
  } = usePaginatedThreads('closed', undefined, true, undefined, false, closedTabEnabled)
  const {
    threads: filteredThreads,
    isLoading: filteredLoading,
    mutate: mutateFiltered,
    removeThreadById: removeFromFiltered,
    prependThread: prependToFiltered,
    loadMore: loadMoreFiltered,
    hasMore: hasMoreFiltered,
    isLoadingMore: isLoadingMoreFiltered,
  } = usePaginatedThreads('open', undefined, true, 'filtered', false, filteredTabEnabled)

  const openCountFromList = openTabEnabled && openListTotalCount !== undefined
    ? openListTotalCount
    : null
  const { openCount, closedCount, spamCount, mutateTabCounts } = useTicketTabCounts({
    needsReply,
    openCountFromList,
  })
  const { setOverride: setSidebarOpenCount } = useOpenThreadCountOverride()

  useEffect(() => {
    setSidebarOpenCount(openCount)
    return () => setSidebarOpenCount(null)
  }, [openCount, setSidebarOpenCount])

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

  const revalidateTicketData = useCallback(async () => {
    await Promise.all([revalidateThreadCaches(), mutateTabCounts()])
  }, [mutateTabCounts, revalidateThreadCaches])

  const { selectedIds, setSelectedIds, handleToggleSelect, handleClearSelection } = useTicketSelection()

  const {
    replyText, setReplyText,
    isSending, sendError, setSendError,
    toast,
    failedMessages, handleRetry, handleRetrySend,
    handleSendMessage, handleResolve, handleReopen,
    handleLinkShopifyCustomer,
    handleBulkClose, handleBulkArchive, handleBulkTag,
    handleMarkAsSpam, handleRecover,
    showToast,
  } = useTicketActions({
    activeTicketId,
    patchThreadCaches,
    revalidateThreadCaches: revalidateTicketData,
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
    revalidateThreadCaches: revalidateTicketData,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeTicket?.messages?.length, activeTicketId])

  const { refreshingSummaryId, handleRefreshSummary } = useSummaryRefresh({
    patchThreadCaches,
    showToast,
  })

  const handleTabChange = (tab: TicketListTab) => {
    dispatchPageState({ type: 'tabChanged', tab })
    setActiveTicketId(null)
    setReplyText('')
    setSendError(null)
    setSelectedIds([])
  }

  const handleSearchChange = (q: string) => {
    dispatchPageState({ type: 'searchChanged', searchQuery: q })
    setActiveTicketId(null)
    setSendError(null)
    if (!q) setSelectedIds([])
  }

  if (isLoading && dbThreads.length === 0 && !isSearchMode) {
    return { kind: 'loading' as const }
  }

  if (error) {
    return { kind: 'error' as const }
  }

  const currentHasMore = effectiveActiveTab === 'open'
    ? hasMoreOpen
    : effectiveActiveTab === 'closed'
      ? hasMoreClosed
      : hasMoreFiltered
  const currentIsLoadingMore = effectiveActiveTab === 'open'
    ? isLoadingMoreOpen
    : effectiveActiveTab === 'closed'
      ? isLoadingMoreClosed
      : isLoadingMoreFiltered
  const currentLoadMore = effectiveActiveTab === 'open'
    ? loadMoreOpen
    : effectiveActiveTab === 'closed'
      ? loadMoreClosed
      : loadMoreFiltered

  return {
    kind: 'ready' as const,
    layoutProps: {
      activeAgentTurns,
      activeFilter,
      activeTab,
      activeThread,
      activeThreadError,
      activeThreadPreview,
      activeTicketId,
      agentName,
      cachedPlan,
      closedCount,
      conversationTicket,
      effectiveActiveTab,
      failedMessages: failedMessages.filter(m => m.threadId === activeTicketId),
      flags: {
        correctReplyVisible: correctReply && !dismissCorrectHint,
        hasMore: currentHasMore,
        hasShopify,
        isAgentRunning,
        isConversationLoading,
        isDesktopContext: Boolean(isDesktopContext),
        isLoadingMore: currentIsLoadingMore,
        isSearchLoading,
        isSearchMode,
        isSending,
        needsReply,
        showContextDrawer,
      },
      filteredTickets,
      liveTicketCount: liveTickets.length,
      messagesEndRef,
      openCount,
      openThreadCount: openThreads.length,
      refreshingSummaryId,
      replyText,
      searchQuery,
      selectedIds,
      sendError,
      spamCount,
      toast,
      onAgentComplete: handleAgentComplete,
      onAgentRunningChange: handleAgentRunningChange,
      onAgentTurnAdd: handleAgentTurnAdd,
      onBack: () => {
        setActiveTicketId(null)
        setSendError(null)
        dispatchPageState({ type: 'contextDrawerChanged', open: false })
      },
      onBulkArchive: () => handleBulkArchive(selectedIds),
      onBulkClose: () => handleBulkClose(selectedIds),
      onBulkTag: (tag: string) => handleBulkTag(selectedIds, tag),
      onClearSelection: handleClearSelection,
      onCorrectReplyDismiss: () => dispatchPageState({ type: 'correctHintDismissed' }),
      onFilterChange: (next: ChannelType | null) => dispatchPageState({ type: 'activeFilterChanged', activeFilter: next }),
      onLinkShopifyCustomer: handleLinkShopifyCustomer,
      onLoadMore: currentLoadMore,
      onMarkAsSpam: handleMarkAsSpam,
      onNeedsReplyChange: (next: boolean) => dispatchPageState({ type: 'needsReplyChanged', needsReply: next }),
      onOpenContext: () => dispatchPageState({ type: 'contextDrawerChanged', open: true }),
      onRecover: handleRecover,
      onRefreshSummary: () => {
        if (activeThread) {
          handleRefreshSummary(activeThread.id)
        }
      },
      onReopen: handleReopen,
      onReplyChange: (text: string) => { setReplyText(text); if (sendError) setSendError(null) },
      onResolve: handleResolve,
      onRetry: handleRetry,
      onRetrySend: handleRetrySend,
      onSearchChange: handleSearchChange,
      onSelectTicket: (id: string) => { setActiveTicketId(id); setSendError(null) },
      onSend: handleSendMessage,
      onShowContextDrawerChange: (open: boolean) => dispatchPageState({ type: 'contextDrawerChanged', open }),
      onTabChange: handleTabChange,
      onToggleSelect: handleToggleSelect,
    },
  }
}
