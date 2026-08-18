"use client"

import { useMemo } from "react"
import { usePaginatedThreads, type ThreadListQuery } from "./usePaginatedThreads"

const SPAM_QUERY: ThreadListQuery = { status: "open", filterStatus: "filtered" }

/**
 * The stream is one paginated source. `status=all` interleaves open and closed
 * server-side under a single cursor, so showing closed rows never reorders the
 * ones already on screen.
 */
export function useInboxThreads(includeClosed: boolean) {
  const streamQuery = useMemo<ThreadListQuery>(
    () => ({ status: includeClosed ? "all" : "open" }),
    [includeClosed],
  )

  const stream = usePaginatedThreads(streamQuery, true, true)
  const spam = usePaginatedThreads(SPAM_QUERY, true, true)

  return { stream, spam }
}
