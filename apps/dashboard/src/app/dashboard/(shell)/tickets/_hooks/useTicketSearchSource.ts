"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import type { Thread } from "@/types"

const EMPTY_SEARCH_THREADS: Thread[] = []

export function useTicketSearchSource(searchQuery: string) {
  const isSearchMode = searchQuery.length >= 2
  const { data: searchData, isLoading: isSearchLoading, mutate: mutateSearch } = useSWR<{ threads: Thread[] }>(
    isSearchMode ? `/api/search?q=${encodeURIComponent(searchQuery)}` : null,
    fetcher,
    { keepPreviousData: true },
  )

  return {
    isSearchLoading,
    isSearchMode,
    mutateSearch,
    searchThreads: searchData?.threads ?? EMPTY_SEARCH_THREADS,
  }
}
