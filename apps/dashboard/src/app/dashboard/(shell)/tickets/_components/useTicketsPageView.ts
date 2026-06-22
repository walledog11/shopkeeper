"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { getCurrentPlanForThread } from "@shopkeeper/agent/plan-cache-shape"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { useOpenThreadCountOverride } from "@/hooks/OpenThreadCountContext"
import { useActiveThreadSelection } from "../_hooks/useActiveThreadSelection"
import { useAgentTurns } from "../_hooks/useAgentTurns"
import { useTicketSearchSource } from "../_hooks/useTicketSearchSource"
import { useTicketThreadSources } from "../_hooks/useTicketThreadSources"
import { useSummaryRefresh } from "../_hooks/useSummaryRefresh"
import { useThreadCacheCoordinator } from "../_hooks/useThreadCacheCoordinator"
import { useTicketActions } from "../_hooks/useTicketActions"
import { useTicketSelection } from "../_hooks/useTicketSelection"
import { useTicketListRowActions } from "../_hooks/useTicketListRowActions"
import { useVisibleTicketList } from "../_hooks/useVisibleTicketList"
import { parseInitialTicketListView, useTicketsPageState } from "./useTicketsPageState"
import type {
  TicketListView,
  TicketTagFilter,
} from "./thread-list/constants"
import type { ChannelType, OrgSettings, Thread } from "@/types"

export interface TicketsPageClientProps {
  initialForMeThreads: Thread[]
  hasShopify: boolean
  agentName: string
  connectedChannels: ChannelType[]
  orgSettings?: Partial<OrgSettings> | null
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
  const initialView = parseInitialTicketListView(searchParams.get("view"))
  const [pageState, dispatchPageState] = useTicketsPageState(initialView)
  const { activeView, channelFilter, dismissCorrectHint, searchQuery, showContextDrawer, tagFilter } = pageState
  const isDesktopContext = useMediaQuery("(min-width: 1280px)")

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    error,
    forMeCount,
    mutateTabCounts,
    spamCount,
    threadSources,
  } = useTicketThreadSources({
    channelFilter,
    initialForMeThreads,
    tagFilter,
  })

  const { setOverride: setSidebarOpenCount } = useOpenThreadCountOverride()

  useEffect(() => {
    setSidebarOpenCount(forMeCount)
    return () => setSidebarOpenCount(null)
  }, [forMeCount, setSidebarOpenCount])

  const { isSearchLoading, isSearchMode, mutateSearch, searchThreads } = useTicketSearchSource(searchQuery)

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

  const { filteredTickets, liveTickets } = useVisibleTicketList({
    agentName,
    effectiveActiveView,
    hasShopify,
    isSearchMode,
    listThreads,
    orgSettings,
  })

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
    dispatchPageState,
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
      conversation: {
        activeAgentTurns,
        activeThread,
        activeThreadError,
        activeThreadPreview,
        agentName,
        cachedPlan,
        conversationTicket,
        failedMessages: failedMessages.filter(m => m.threadId === activeTicketId),
        messagesEndRef,
        orgSettings,
        refreshingSummaryId,
        replyText,
        sendError,
        toast,
      },
      drawer: {
        isDesktopContext: Boolean(isDesktopContext),
        showContextDrawer,
      },
      filters: {
        channelFilter,
        connectedChannels,
        searchQuery,
        tagFilter,
      },
      flags: {
        correctReplyVisible: correctReply && !dismissCorrectHint,
        hasMore: currentThreadSource.hasMore,
        hasShopify,
        isAgentRunning,
        isConversationLoading,
        isLoadingMore: currentThreadSource.isLoadingMore,
        isSearchLoading,
        isSearchMode,
        isSending,
        listLoading,
      },
      list: {
        activeTicketId,
        activeView,
        approvingTicketId,
        effectiveActiveView,
        filteredTickets,
        forMeCount,
        liveTicketCount: liveTickets.length,
        openThreadCount: threadSources.for_me.threads.length,
        selectedIds,
        spamCount,
      },
      actions: {
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
    },
  }
}
