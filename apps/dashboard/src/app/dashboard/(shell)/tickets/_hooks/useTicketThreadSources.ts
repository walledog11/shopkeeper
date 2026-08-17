"use client"

import { useMemo } from "react"
import { usePaginatedThreads } from "./usePaginatedThreads"
import { useTicketTabCounts } from "./useTicketTabCounts"
import type { TicketListView } from "../_components/thread-list/constants"

function buildListQuery(view: TicketListView) {
  if (view === "closed") {
    return { status: "closed" as const }
  }
  if (view === "spam") {
    return { status: "open" as const, filterStatus: "filtered" as const }
  }
  // Open and closed interleave under one cursor; triage tiers filter client-side.
  return { status: "all" as const }
}

export function useTicketThreadSources(input: {
  activeView: TicketListView
  loadAllSources?: boolean
}) {
  const { activeView, loadAllSources = false } = input
  const streamQuery = useMemo(() => buildListQuery("for_me"), [])
  const closedQuery = useMemo(() => buildListQuery("closed"), [])
  const spamQuery = useMemo(() => buildListQuery("spam"), [])
  const sourceEnabled = (view: TicketListView) => loadAllSources || activeView === view

  const streamSource = usePaginatedThreads(streamQuery, true, sourceEnabled("for_me") || sourceEnabled("all_open"))
  const closedSource = usePaginatedThreads(closedQuery, true, sourceEnabled("closed"))
  const spamSource = usePaginatedThreads(spamQuery, true, sourceEnabled("spam"))
  const threadSources = {
    for_me: streamSource,
    all_open: streamSource,
    closed: closedSource,
    spam: spamSource,
  } satisfies Record<TicketListView, typeof streamSource>

  const forMeCountFromList = streamSource.totalCount !== undefined
    ? streamSource.totalCount
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
