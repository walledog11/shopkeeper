import { useCallback, useRef, useState } from 'react'
import type { TicketToast } from './useTicketActions'
import type { Thread } from '@/types'

interface UseSummaryRefreshProps {
  patchThreadCaches: (threadId: string, updateThread: (thread: Thread) => Thread) => Promise<void>
  showToast: (message: string, tone?: TicketToast['tone']) => void
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useSummaryRefresh({ patchThreadCaches, showToast }: UseSummaryRefreshProps) {
  const [refreshingSummaryId, setRefreshingSummaryId] = useState<string | null>(null)
  const refreshingSummaryIdsRef = useRef<Set<string> | null>(null)

  const patchThreadSummary = useCallback(async (
    threadId: string,
    update: { title: string | null; summary: string | null },
  ) => {
    await patchThreadCaches(threadId, thread => ({
      ...thread,
      aiTitle: update.title,
      aiSummary: update.summary,
    }))
  }, [patchThreadCaches])

  const handleRefreshSummary = useCallback(async (threadId: string) => {
    const refreshingSummaryIds = refreshingSummaryIdsRef.current ?? (refreshingSummaryIdsRef.current = new Set<string>())
    if (refreshingSummaryIds.has(threadId)) return
    refreshingSummaryIds.add(threadId)
    setRefreshingSummaryId(threadId)

    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      })
      const data = await res.json().catch(() => null) as {
        error?: unknown
        title?: unknown
        summary?: unknown
      } | null

      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' && data.error.trim()
          ? data.error
          : `Server error: ${res.status}`)
      }

      await patchThreadSummary(threadId, {
        title: typeof data?.title === 'string' ? data.title : null,
        summary: typeof data?.summary === 'string' ? data.summary : null,
      })
    } catch (err) {
      showToast(errorMessage(err, 'Failed to refresh summary.'), 'error')
    } finally {
      refreshingSummaryIds.delete(threadId)
      setRefreshingSummaryId(current => current === threadId ? null : current)
    }
  }, [patchThreadSummary, showToast])

  return {
    refreshingSummaryId,
    handleRefreshSummary,
  }
}
