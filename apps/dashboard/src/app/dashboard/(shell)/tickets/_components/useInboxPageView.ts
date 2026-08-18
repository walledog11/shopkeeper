"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { getResolvedCachedPlanForThread } from "@/lib/agent/cached-thread-plan"
import { useMobileChromeOverride } from "@/app/dashboard/_components/mobile-chrome/MobileChromeContext"
import { useIsMobile } from "@/hooks/useMobile"
import { useActiveThreadSelection } from "../_hooks/useActiveThreadSelection"
import { useAgentTurns } from "../_hooks/useAgentTurns"
import { useInboxThreads } from "../_hooks/useInboxThreads"
import { useTicketSearchSource } from "../_hooks/useTicketSearchSource"
import { useThreadCacheCoordinator } from "../_hooks/useThreadCacheCoordinator"
import { useTicketActions } from "../_hooks/useTicketActions"
import { useTicketListRowActions } from "../_hooks/useTicketListRowActions"
import { threadToTicket } from "../_lib/thread-to-ticket"
import type { OrgSettings, Thread } from "@/types"

export interface InboxPageClientProps {
  hasShopify: boolean
  orgSettings?: Partial<OrgSettings> | null
}

export function useInboxPageView({
  hasShopify,
  orgSettings = null,
}: InboxPageClientProps) {
  const searchParams = useSearchParams()
  const queryThreadId = searchParams.get("thread")
  const correctReply = searchParams.get("correct") === "1"
  const [dismissCorrectHint, setDismissCorrectHint] = useState(false)
  const [includeClosed, setIncludeClosed] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const isMobile = useIsMobile()

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { stream, spam } = useInboxThreads(includeClosed)
  const { isSearchLoading, isSearchMode, mutateSearch, searchThreads } = useTicketSearchSource(searchQuery)

  const knownThreads = useMemo<Thread[]>(
    () => [...stream.threads, ...spam.threads, ...searchThreads],
    [searchThreads, spam.threads, stream.threads],
  )

  const {
    activeTicketId,
    setActiveTicketId,
    activeThread,
    activeThreadData,
    activeThreadError,
    activeThreadPreview,
    activeTicket,
    conversationTicket,
    isConversationLoading,
    mutateActiveThread,
  } = useActiveThreadSelection({ queryThreadId, knownThreads })

  useMobileChromeOverride(
    isMobile ? (activeTicketId ? "detail" : "local") : null,
  )

  const listThreads = isSearchMode ? searchThreads : stream.threads
  const tickets = useMemo(() => listThreads.map(threadToTicket), [listThreads])
  const spamTickets = useMemo(() => spam.threads.map(threadToTicket), [spam.threads])

  const cachedPlan = useMemo(
    () => activeThread ? getResolvedCachedPlanForThread(activeThread) : null,
    [activeThread],
  )

  const {
    patchThreadCaches,
    moveThreadStatus,
    moveThreadFilterStatus,
    revalidateThreadCaches,
  } = useThreadCacheCoordinator({
    streamThreads: stream.threads,
    filteredThreads: spam.threads,
    activeThread: activeThreadData?.thread,
    streamIncludesClosed: includeClosed,
    mutateStream: stream.mutate,
    mutateFiltered: spam.mutate,
    removeFromStream: stream.removeThreadById,
    removeFromFiltered: spam.removeThreadById,
    prependToStream: stream.prependThread,
    prependToFiltered: spam.prependThread,
    mutateSearch,
    mutateActiveThread,
  })

  const {
    replyText, setReplyText,
    isSending, sendError, setSendError,
    toast,
    failedMessages, handleRetry, handleRetrySend,
    handleSendMessage, handleResolve, handleReopen,
    handleLinkShopifyCustomer,
    handleMarkAsSpam, handleRecover,
    showToast,
  } = useTicketActions({
    activeTicketId,
    patchThreadCaches,
    revalidateThreadCaches,
    moveThreadStatus,
    moveThreadFilterStatus,
    setActiveTicketId,
  })

  const { approvingTicketId, handleQuickApproveFromList } = useTicketListRowActions({
    patchThreadCaches,
    revalidateThreadCaches,
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
    revalidateThreadCaches,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeTicket?.messages?.length, activeTicketId])

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    setActiveTicketId(null)
    setSendError(null)
  }, [setActiveTicketId, setSendError])

  const listLoading = stream.isLoading && stream.threads.length === 0 && !isSearchMode

  if (stream.error && stream.threads.length === 0 && !isSearchMode) {
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
        cachedPlan,
        conversationTicket,
        failedMessages: failedMessages.filter(message => message.threadId === activeTicketId),
        messagesEndRef,
        orgSettings,
        replyText,
        sendError,
        toast,
      },
      flags: {
        correctReplyVisible: correctReply && !dismissCorrectHint,
        hasMore: stream.hasMore,
        hasShopify,
        includeClosed,
        isAgentRunning,
        isConversationLoading,
        isLoadingMore: stream.isLoadingMore,
        isSearchLoading,
        isSearchMode,
        isSending,
        listLoading,
      },
      list: {
        activeTicketId,
        approvingTicketId,
        searchQuery,
        spamTickets,
        tickets,
        totalCount: stream.totalCount ?? stream.threads.length,
      },
      actions: {
        onAgentComplete: handleAgentComplete,
        onAgentRunningChange: handleAgentRunningChange,
        onAgentTurnAdd: handleAgentTurnAdd,
        onBack: () => {
          setActiveTicketId(null)
          setSendError(null)
        },
        onCorrectReplyDismiss: () => setDismissCorrectHint(true),
        onLinkShopifyCustomer: handleLinkShopifyCustomer,
        onLoadMore: stream.loadMore,
        onNotReal: handleMarkAsSpam,
        onOpen: (id: string) => { setActiveTicketId(id); setSendError(null) },
        onRecover: handleRecover,
        onAnswered: () => { void revalidateThreadCaches() },
        onReopen: handleReopen,
        onReplyChange: (text: string) => { setReplyText(text); if (sendError) setSendError(null) },
        onResolve: handleResolve,
        onRetry: handleRetry,
        onRetrySend: handleRetrySend,
        onReview: handleReviewFromList,
        onSearchChange: handleSearchChange,
        onSend: handleQuickApproveFromList,
        onSendMessage: handleSendMessage,
        onActionError: (message: string) => showToast(message, "error"),
        onTicketRefresh: revalidateThreadCaches,
        onToggleClosed: () => setIncludeClosed(current => !current),
        onTrust: handleRecover,
      },
    },
  }
}
