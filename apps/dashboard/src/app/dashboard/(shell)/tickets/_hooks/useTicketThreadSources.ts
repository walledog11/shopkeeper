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
  activeView: TicketListView
  channelFilter: ChannelType | null
  initialForMeThreads: Thread[]
  loadAllSources?: boolean
  tagFilter: TicketTagFilter | null
}) {
  const { activeView, channelFilter, initialForMeThreads, loadAllSources = false, tagFilter } = input
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
  const sourceEnabled = (view: TicketListView) => loadAllSources || activeView === view

  const forMeSource = usePaginatedThreads(forMeQuery, initialForMeThreads, true, sourceEnabled("for_me"))
  const allOpenSource = usePaginatedThreads(allOpenQuery, undefined, true, sourceEnabled("all_open"))
  const closedSource = usePaginatedThreads(closedQuery, undefined, true, sourceEnabled("closed"))
  const spamSource = usePaginatedThreads(spamQuery, undefined, true, sourceEnabled("spam"))
  const threadSources = {
    for_me: forMeSource,
    all_open: allOpenSource,
    closed: closedSource,
    spam: spamSource,
  } satisfies Record<TicketListView, typeof forMeSource>

  const forMeCountFromList = forMeSource.totalCount !== undefined
    ? forMeSource.totalCount
    : null
  const spamCountFromList = spamSource.totalCount !== undefined
    ? spamSource.totalCount
    : null

  const {
    forMeCount,
    spamCount,
    mutateTabCounts,
  } = useTicketTabCounts({
    forMeCountFromList,
    spamCountFromList,
  })

  return {
    error: threadSources[activeView].error,
    forMeCount,
    mutateTabCounts,
    spamCount,
    threadSources,
  }
}
