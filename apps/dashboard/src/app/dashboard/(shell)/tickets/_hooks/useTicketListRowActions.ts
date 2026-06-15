"use client"

import { useCallback, useState } from "react"
import { quickApproveCachedPlan } from "./conversation-agent-requests"
import type { Thread } from "@/types"
import type { TicketToast } from "./useTicketActions"

interface UseTicketListRowActionsProps {
  patchThreadCaches: (threadId: string, updateThread: (thread: Thread) => Thread) => Promise<void>
  revalidateThreadCaches: () => Promise<void>
  showToast: (message: string, tone?: TicketToast["tone"]) => void
}

export function useTicketListRowActions({
  patchThreadCaches,
  revalidateThreadCaches,
  showToast,
}: UseTicketListRowActionsProps) {
  const [approvingTicketId, setApprovingTicketId] = useState<string | null>(null)

  const handleQuickApproveFromList = useCallback(async (threadId: string) => {
    if (approvingTicketId) return

    setApprovingTicketId(threadId)
    try {
      const result = await quickApproveCachedPlan(threadId)
      if (!result.ok) {
        showToast(result.error, "error")
        return
      }

      await patchThreadCaches(threadId, thread => ({
        ...thread,
        cachedPlan: null,
        cachedPlanMessageId: null,
      }))
      await revalidateThreadCaches()
      showToast("Reply sent")
    } finally {
      setApprovingTicketId(null)
    }
  }, [approvingTicketId, patchThreadCaches, revalidateThreadCaches, showToast])

  return {
    approvingTicketId,
    handleQuickApproveFromList,
  }
}
