import useSWR from "swr"
import { useCallback } from "react"
import { fetcher } from "@/lib/api/fetcher"

type ThreadCount = { count: number }

const TAB_COUNT_REFRESH_MS = 60_000

export function buildOpenThreadCountKey(needsReply: boolean) {
  return needsReply
    ? "/api/threads?status=open&count=true&needsReply=true"
    : "/api/threads?status=open&count=true"
}

export const CLOSED_THREAD_COUNT_KEY = "/api/threads?status=closed&count=true"
export const FILTERED_THREAD_COUNT_KEY = "/api/threads?status=open&count=true&filterStatus=filtered"

interface Options {
  needsReply: boolean
  openCountFromList: number | null
}

export function useTicketTabCounts({ needsReply, openCountFromList }: Options) {
  const openCountKey = buildOpenThreadCountKey(needsReply)
  const skipOpenCountPoll = openCountFromList !== null

  const { data: openData, mutate: mutateOpenCount } = useSWR<ThreadCount>(
    skipOpenCountPoll ? null : openCountKey,
    fetcher,
    { refreshInterval: TAB_COUNT_REFRESH_MS, revalidateOnFocus: false },
  )

  const { data: closedData, mutate: mutateClosedCount } = useSWR<ThreadCount>(
    CLOSED_THREAD_COUNT_KEY,
    fetcher,
    { refreshInterval: TAB_COUNT_REFRESH_MS, revalidateOnFocus: false },
  )

  const { data: filteredData, mutate: mutateFilteredCount } = useSWR<ThreadCount>(
    FILTERED_THREAD_COUNT_KEY,
    fetcher,
    { refreshInterval: TAB_COUNT_REFRESH_MS, revalidateOnFocus: false },
  )

  const mutateTabCounts = useCallback(async () => {
    await Promise.all([
      skipOpenCountPoll ? Promise.resolve() : mutateOpenCount(),
      mutateClosedCount(),
      mutateFilteredCount(),
    ])
  }, [mutateClosedCount, mutateFilteredCount, mutateOpenCount, skipOpenCountPoll])

  return {
    openCount: openCountFromList ?? openData?.count ?? 0,
    closedCount: closedData?.count ?? 0,
    spamCount: filteredData?.count ?? 0,
    mutateTabCounts,
  }
}
