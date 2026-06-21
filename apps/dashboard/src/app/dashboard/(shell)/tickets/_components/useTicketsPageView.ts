"use client"

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { getCurrentPlanForThread } from "@shopkeeper/agent/plan-cache-shape"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { useOpenThreadCountOverride } from "@/hooks/OpenThreadCountContext"
import { fetcher } from "@/lib/api/fetcher"
import { useActiveThreadSelection } from "../_hooks/useActiveThreadSelection"
import { useAgentTurns } from "../_hooks/useAgentTurns"
import { usePaginatedThreads } from "../_hooks/usePaginatedThreads"
import { useSummaryRefresh } from "../_hooks/useSummaryRefresh"
import { useThreadCacheCoordinator } from "../_hooks/useThreadCacheCoordinator"
import { useTicketActions } from "../_hooks/useTicketActions"
import { useTicketSelection } from "../_hooks/useTicketSelection"
import { useTicketListRowActions } from "../_hooks/useTicketListRowActions"
import { useTicketTabCounts } from "../_hooks/useTicketTabCounts"
import { threadToTicket } from "../_lib/thread-to-ticket"
import {
  buildTicketListPresentationFromTicket,
  compareTicketTriageTier,
} from "../_lib/ticket-list-presentation"
import type {
  TicketListView,
  TicketTagFilter,
} from "./thread-list/constants"
import type { ChannelType, OrgSettings, Thread, Ticket } from "@/types"

export interface TicketsPageClientProps {
  initialForMeThreads: Thread[]
  hasShopify: boolean
  agentName: string
  connectedChannels: ChannelType[]
  orgSettings?: Partial<OrgSettings> | null
}

interface TicketsPageState {
  activeView: TicketListView
  channelFilter: ChannelType | null
  dismissCorrectHint: boolean
  searchQuery: string
  showContextDrawer: boolean
  tagFilter: TicketTagFilter | null
}

type TicketsPageAction =
  | { type: "channelFilterChanged"; channelFilter: ChannelType | null }
  | { type: "contextDrawerChanged"; open: boolean }
  | { type: "correctHintDismissed" }
  | { type: "searchChanged"; searchQuery: string }
  | { type: "tagFilterChanged"; tagFilter: TicketTagFilter | null }
  | { type: "viewChanged"; view: TicketListView }

const EMPTY_SEARCH_THREADS: Thread[] = []

const VALID_VIEWS = new Set<TicketListView>(["for_me", "all_open", "closed", "spam"])

function parseInitialView(viewParam: string | null): TicketListView {
  if (viewParam && VALID_VIEWS.has(viewParam as TicketListView)) {
    return viewParam as TicketListView
  }
  return "for_me"
}

function buildListQuery(
  view: TicketListView,
  tagFilter: TicketTagFilter | null,
  channelFilter: ChannelType | null,
) {
  if (view === "closed") {
    return { status: "closed" as const }
  }
  if (view === "spam") {
    return { status: "open" as const, filterStatus: "filtered" as const }
  }
  const base = view === "for_me"
    ? { status: "open" as const, forMe: true as const }
    : { status: "open" as const }
  return {
    ...base,
    ...(tagFilter ? { tag: tagFilter } : {}),
    ...(channelFilter ? { channelType: channelFilter } : {}),
  }
}

const INITIAL_TICKETS_PAGE_STATE: TicketsPageState = {
  activeView: "for_me",
  channelFilter: null,
  dismissCorrectHint: false,
  searchQuery: "",
  showContextDrawer: false,
  tagFilter: null,
}

function ticketsPageReducer(state: TicketsPageState, action: TicketsPageAction): TicketsPageState {
  switch (action.type) {
    case "channelFilterChanged":
      return { ...state, channelFilter: action.channelFilter }
    case "contextDrawerChanged":
      return { ...state, showContextDrawer: action.open }
    case "correctHintDismissed":
      return { ...state, dismissCorrectHint: true }
    case "searchChanged":
      return { ...state, searchQuery: action.searchQuery }
    case "tagFilterChanged":
      return { ...state, tagFilter: action.tagFilter }
    case "viewChanged":
      return {
        ...state,
        activeView: action.view,
        searchQuery: "",
      }
  }
}

export function useTicketsPageView({
  initialForMeThreads,
  hasShopify,
  agentName,
  connectedChannels,
  orgSettings = null,
}: TicketsPageClientProps) {
  const searchParams = useSearchParams()
  const queryThreadId = searchParams.get("thread")
  const correctReply = searchParams.get("correct") === "1"
  const initialView = parseInitialView(searchParams.get("view"))
  const [pageState, dispatchPageState] = useReducer(
    ticketsPageReducer,
    { ...INITIAL_TICKETS_PAGE_STATE, activeView: initialView },
  )
  const { activeView, channelFilter, dismissCorrectHint, searchQuery, showContextDrawer, tagFilter } = pageState
  const isDesktopContext = useMediaQuery("(min-width: 1280px)")

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const forMeQuery = useMemo(
    () => buildListQuery("for_me", tagFilter, channelFilter),
    [channelFilter, tagFilter],
  )
  const allOpenQuery = useMemo(
    () => buildListQuery("all_open", tagFilter, channelFilter),
    [channelFilter, tagFilter],
  )
  const closedQuery = useMemo(() => buildListQuery("closed", null, null), [])
  const spamQuery = useMemo(() => buildListQuery("spam", null, null), [])

  const forMeEnabled = true
  const allOpenEnabled = true
  const closedEnabled = true
  const spamEnabled = true

  const {
    threads: forMeThreads,
    totalCount: forMeListTotalCount,
    isLoading: forMeLoading,
    error,
    mutate: mutateForMe,
    removeThreadById: removeFromForMe,
    prependThread: prependToForMe,
    loadMore: loadMoreForMe,
    hasMore: hasMoreForMe,
    isLoadingMore: isLoadingMoreForMe,
  } = usePaginatedThreads(forMeQuery, initialForMeThreads, true, forMeEnabled)

  const {
    threads: allOpenThreads,
    totalCount: allOpenListTotalCount,
    isLoading: allOpenLoading,
    mutate: mutateAllOpen,
    removeThreadById: removeFromAllOpen,
    prependThread: prependToAllOpen,
    loadMore: loadMoreAllOpen,
    hasMore: hasMoreAllOpen,
    isLoadingMore: isLoadingMoreAllOpen,
  } = usePaginatedThreads(allOpenQuery, undefined, true, allOpenEnabled)

  const {
    threads: closedThreads,
    isLoading: closedLoading,
    mutate: mutateClosed,
    removeThreadById: removeFromClosed,
    prependThread: prependToClosed,
    loadMore: loadMoreClosed,
    hasMore: hasMoreClosed,
    isLoadingMore: isLoadingMoreClosed,
  } = usePaginatedThreads(closedQuery, undefined, true, closedEnabled)

  const {
    threads: spamThreads,
    isLoading: spamLoading,
    mutate: mutateSpam,
    removeThreadById: removeFromSpam,
    prependThread: prependToSpam,
    loadMore: loadMoreSpam,
    hasMore: hasMoreSpam,
    isLoadingMore: isLoadingMoreSpam,
  } = usePaginatedThreads(spamQuery, undefined, true, spamEnabled)

  const threadSources = {
    for_me: {
      threads: forMeThreads,
      isLoading: forMeLoading,
      hasMore: hasMoreForMe,
      isLoadingMore: isLoadingMoreForMe,
      loadMore: loadMoreForMe,
      mutate: mutateForMe,
      removeThreadById: removeFromForMe,
      prependThread: prependToForMe,
    },
    all_open: {
      threads: allOpenThreads,
      isLoading: allOpenLoading,
      hasMore: hasMoreAllOpen,
      isLoadingMore: isLoadingMoreAllOpen,
      loadMore: loadMoreAllOpen,
      mutate: mutateAllOpen,
      removeThreadById: removeFromAllOpen,
      prependThread: prependToAllOpen,
    },
    closed: {
      threads: closedThreads,
      isLoading: closedLoading,
      hasMore: hasMoreClosed,
      isLoadingMore: isLoadingMoreClosed,
      loadMore: loadMoreClosed,
      mutate: mutateClosed,
      removeThreadById: removeFromClosed,
      prependThread: prependToClosed,
    },
    spam: {
      threads: spamThreads,
      isLoading: spamLoading,
      hasMore: hasMoreSpam,
      isLoadingMore: isLoadingMoreSpam,
      loadMore: loadMoreSpam,
      mutate: mutateSpam,
      removeThreadById: removeFromSpam,
      prependThread: prependToSpam,
    },
  } satisfies Record<TicketListView, {
    threads: Thread[]
    isLoading: boolean
    hasMore: boolean
    isLoadingMore: boolean
    loadMore: typeof loadMoreForMe
    mutate: typeof mutateForMe
    removeThreadById: typeof removeFromForMe
    prependThread: typeof prependToForMe
  }>

  const forMeCountFromList = forMeEnabled && forMeListTotalCount !== undefined
    ? forMeListTotalCount
    : null

  const {
    forMeCount,
    spamCount,
    mutateTabCounts,
  } = useTicketTabCounts({
    forMeCountFromList,
  })

  const { setOverride: setSidebarOpenCount } = useOpenThreadCountOverride()

  useEffect(() => {
    setSidebarOpenCount(forMeCount)
    return () => setSidebarOpenCount(null)
  }, [forMeCount, setSidebarOpenCount])

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
    effectiveActiveView,
    isConversationLoading,
    mutateActiveThread,
  } = useActiveThreadSelection({
    queryThreadId,
    activeView,
    forMeThreads: threadSources.for_me.threads,
    allOpenThreads: threadSources.all_open.threads,
    closedThreads: threadSources.closed.threads,
    spamThreads: threadSources.spam.threads,
    searchThreads,
    agentName,
  })

  const currentThreadSource = threadSources[effectiveActiveView]
  const dbThreads = isSearchMode ? [] : currentThreadSource.threads
  const isLoading = currentThreadSource.isLoading

  const listThreads = isSearchMode ? searchThreads : dbThreads

  const liveTickets: Ticket[] = useMemo(
    () => listThreads.map(t => threadToTicket(t, agentName)),
    [listThreads, agentName],
  )

  const filteredTickets = useMemo(() => {
    const tickets = [...liveTickets]

    if (!isSearchMode && effectiveActiveView === "for_me") {
      tickets.sort((left, right) => {
        const leftPresentation = buildTicketListPresentationFromTicket(left, {
          orgSettings,
          hasShopify,
          listView: "for_me",
          activeTab: "open",
        })
        const rightPresentation = buildTicketListPresentationFromTicket(right, {
          orgSettings,
          hasShopify,
          listView: "for_me",
          activeTab: "open",
        })
        const tierOrder = compareTicketTriageTier(leftPresentation.tier, rightPresentation.tier)
        if (tierOrder !== 0) return tierOrder
        return new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime()
      })
      return tickets
    }

    if (!isSearchMode) {
      tickets.sort(
        (left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
      )
    }

    return tickets
  }, [effectiveActiveView, hasShopify, isSearchMode, liveTickets, orgSettings])

  const cachedPlan = useMemo(
    () => activeThread ? getCurrentPlanForThread(activeThread, activeThread.messages) : null,
    [activeThread],
  )

  const {
    patchThreadCaches,
    moveThreadStatus,
    moveThreadFilterStatus,
    revalidateThreadCaches,
  } = useThreadCacheCoordinator({
    openThreads: threadSources.for_me.threads,
    allOpenThreads: threadSources.all_open.threads,
    closedThreads: threadSources.closed.threads,
    filteredThreads: threadSources.spam.threads,
    activeThread: activeThreadData?.thread,
    mutateOpen: threadSources.for_me.mutate,
    mutateClosed: threadSources.closed.mutate,
    mutateFiltered: threadSources.spam.mutate,
    removeFromOpen: threadSources.for_me.removeThreadById,
    removeFromClosed: threadSources.closed.removeThreadById,
    removeFromFiltered: threadSources.spam.removeThreadById,
    prependToOpen: threadSources.for_me.prependThread,
    prependToClosed: threadSources.closed.prependThread,
    prependToFiltered: threadSources.spam.prependThread,
    mutateSearch,
    mutateActiveThread,
    mutateAllOpen: threadSources.all_open.mutate,
    removeFromAllOpen: threadSources.all_open.removeThreadById,
    prependToAllOpen: threadSources.all_open.prependThread,
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

  const { approvingTicketId, handleQuickApproveFromList } = useTicketListRowActions({
    patchThreadCaches,
    revalidateThreadCaches: revalidateTicketData,
    showToast,
  })

  const handleReviewFromList = useCallback((threadId: string) => {
    setActiveTicketId(threadId)
    setSendError(null)
  }, [setActiveTicketId, setSendError])

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeTicket?.messages?.length, activeTicketId])

  const { refreshingSummaryId, handleRefreshSummary } = useSummaryRefresh({
    patchThreadCaches,
    showToast,
  })

  const handleViewChange = (view: TicketListView) => {
    dispatchPageState({ type: "viewChanged", view })
    setActiveTicketId(null)
    setReplyText("")
    setSendError(null)
    setSelectedIds([])
  }

  const handleSearchChange = (q: string) => {
    dispatchPageState({ type: "searchChanged", searchQuery: q })
    setActiveTicketId(null)
    setSendError(null)
    if (!q) setSelectedIds([])
  }

  const listLoading = isLoading && dbThreads.length === 0 && !isSearchMode
  const isBoardView = !isSearchMode && (effectiveActiveView === "for_me" || effectiveActiveView === "all_open")

  useEffect(() => {
    if (!isBoardView || !activeTicketId || queryThreadId || listLoading) return
    if (filteredTickets.some(ticket => ticket.id === activeTicketId)) return

    setActiveTicketId(null)
    setReplyText("")
    setSendError(null)
    dispatchPageState({ type: "contextDrawerChanged", open: false })
  }, [
    activeTicketId,
    filteredTickets,
    isBoardView,
    listLoading,
    queryThreadId,
    setActiveTicketId,
    setReplyText,
    setSendError,
  ])

  if (error && dbThreads.length === 0 && !isSearchMode) {
    return { kind: "error" as const }
  }

  return {
    kind: "ready" as const,
    layoutProps: {
      activeAgentTurns,
      activeView,
      effectiveActiveView,
      channelFilter,
      tagFilter,
      activeThread,
      activeThreadError,
      activeThreadPreview,
      activeTicketId,
      agentName,
      cachedPlan,
      connectedChannels,
      conversationTicket,
      failedMessages: failedMessages.filter(m => m.threadId === activeTicketId),
      orgSettings,
      flags: {
        correctReplyVisible: correctReply && !dismissCorrectHint,
        hasMore: currentThreadSource.hasMore,
        hasShopify,
        isAgentRunning,
        isConversationLoading,
        isDesktopContext: Boolean(isDesktopContext),
        isLoadingMore: currentThreadSource.isLoadingMore,
        isSearchLoading,
        isSearchMode,
        isSending,
        listLoading,
        showContextDrawer,
      },
      filteredTickets,
      forMeCount,
      liveTicketCount: liveTickets.length,
      messagesEndRef,
      openThreadCount: forMeThreads.length,
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
        dispatchPageState({ type: "contextDrawerChanged", open: false })
      },
      onBulkArchive: () => handleBulkArchive(selectedIds),
      onBulkClose: () => handleBulkClose(selectedIds),
      onBulkTag: (tag: string) => handleBulkTag(selectedIds, tag),
      onClearSelection: handleClearSelection,
      onCorrectReplyDismiss: () => dispatchPageState({ type: "correctHintDismissed" }),
      onChannelFilterChange: (next: ChannelType | null) => dispatchPageState({ type: "channelFilterChanged", channelFilter: next }),
      onTagFilterChange: (next: TicketTagFilter | null) => dispatchPageState({ type: "tagFilterChanged", tagFilter: next }),
      onLinkShopifyCustomer: handleLinkShopifyCustomer,
      onLoadMore: currentThreadSource.loadMore,
      onMarkAsSpam: handleMarkAsSpam,
      onRecover: handleRecover,
      onOpenContext: () => dispatchPageState({ type: "contextDrawerChanged", open: true }),
      approvingTicketId,
      onQuickApproveFromList: handleQuickApproveFromList,
      onReviewFromList: handleReviewFromList,
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
      onTicketRefresh: revalidateTicketData,
      onActionError: (message: string) => showToast(message, "error"),
      onSearchChange: handleSearchChange,
      onSelectTicket: (id: string) => { setActiveTicketId(id); setSendError(null) },
      onSend: handleSendMessage,
      onShowContextDrawerChange: (open: boolean) => dispatchPageState({ type: "contextDrawerChanged", open }),
      onViewChange: handleViewChange,
      onToggleSelect: handleToggleSelect,
      onViewSpam: () => handleViewChange("spam"),
    },
  }
}
