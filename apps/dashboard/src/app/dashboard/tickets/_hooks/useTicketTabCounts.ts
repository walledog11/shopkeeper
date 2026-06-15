import useSWR from "swr"
import { useCallback } from "react"
import { fetcher } from "@/lib/api/fetcher"

type ThreadCount = { count: number }

const TAB_COUNT_REFRESH_MS = 60_000

function buildThreadCountKey(kind: "for_me" | "spam") {
  const params = new URLSearchParams({ count: "true" })
  if (kind === "for_me") {
    params.set("status", "open")
    params.set("forMe", "true")
  } else {
    params.set("status", "open")
    params.set("filterStatus", "filtered")
  }
  return `/api/threads?${params.toString()}`
}

interface Options {
  forMeCountFromList: number | null
}

export function useTicketTabCounts({ forMeCountFromList }: Options) {
  const skipForMePoll = forMeCountFromList !== null

  const { data: forMeData, mutate: mutateForMeCount } = useSWR<ThreadCount>(
    skipForMePoll ? null : buildThreadCountKey("for_me"),
    fetcher,
    { refreshInterval: TAB_COUNT_REFRESH_MS, revalidateOnFocus: false },
  )

  const { data: spamData, mutate: mutateSpamCount } = useSWR<ThreadCount>(
    buildThreadCountKey("spam"),
    fetcher,
    { refreshInterval: TAB_COUNT_REFRESH_MS, revalidateOnFocus: false },
  )

  const mutateTabCounts = useCallback(async () => {
    await Promise.all([
      skipForMePoll ? Promise.resolve() : mutateForMeCount(),
      mutateSpamCount(),
    ])
  }, [mutateForMeCount, mutateSpamCount, skipForMePoll])

  return {
    forMeCount: forMeCountFromList ?? forMeData?.count ?? 0,
    spamCount: spamData?.count ?? 0,
    mutateTabCounts,
  }
}
