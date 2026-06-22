"use client"

import { useMemo } from "react"
import { usePaginatedThreads } from "./usePaginatedThreads"
import { useTicketTabCounts } from "./useTicketTabCounts"
import type { TicketListView, TicketTagFilter } from "../_components/thread-list/constants"
import type { ChannelType, Thread } from "@/types"

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

export function useTicketThreadSources(input: {
  channelFilter: ChannelType | null
  initialForMeThreads: Thread[]
  tagFilter: TicketTagFilter | null
}) {
  const { channelFilter, initialForMeThreads, tagFilter } = input
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

  const forMeSource = usePaginatedThreads(forMeQuery, initialForMeThreads, true, true)
  const allOpenSource = usePaginatedThreads(allOpenQuery, undefined, true, true)
  const closedSource = usePaginatedThreads(closedQuery, undefined, true, true)
  const spamSource = usePaginatedThreads(spamQuery, undefined, true, true)

  const forMeCountFromList = forMeSource.totalCount !== undefined
    ? forMeSource.totalCount
    : null

  const {
    forMeCount,
    spamCount,
    mutateTabCounts,
  } = useTicketTabCounts({
    forMeCountFromList,
  })

  return {
    error: forMeSource.error,
    forMeCount,
    mutateTabCounts,
    spamCount,
    threadSources: {
      for_me: forMeSource,
      all_open: allOpenSource,
      closed: closedSource,
      spam: spamSource,
    } satisfies Record<TicketListView, typeof forMeSource>,
  }
}
