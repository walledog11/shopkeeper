import { useCallback, useRef, useState } from "react"
import useSWR from "swr"
import { errorMessageFromUnknown, fetcher } from "@/lib/api/fetcher"

export interface CursorListPage<TItem> {
  items: TItem[]
  nextPageInfo: string | null
}

interface UseCursorListStateOptions<TItem, TResponse> {
  buildUrl: (debouncedQuery: string) => string
  debounceMs?: number
  fetchPage: (pageInfo: string) => Promise<CursorListPage<TItem>>
  loadMoreErrorMessage: string
  onInitialLoad?: (response: TResponse) => void
  searchMinLength?: number
  selectInitialPage: (response: TResponse) => CursorListPage<TItem>
}

export function useCursorListState<TItem, TResponse>({
  buildUrl,
  debounceMs = 250,
  fetchPage,
  loadMoreErrorMessage,
  onInitialLoad,
  searchMinLength = 0,
  selectInitialPage,
}: UseCursorListStateOptions<TItem, TResponse>) {
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [pages, setPages] = useState<TItem[][]>([])
  const [nextPageInfo, setNextPageInfo] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetPagination = useCallback(() => {
    setPages([])
    setNextPageInfo(null)
    setLoadMoreError(null)
  }, [])

  const resetSearch = useCallback(() => {
    setSearchQuery("")
    setDebouncedQuery("")
    resetPagination()
  }, [resetPagination])

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query)
      resetPagination()
    }, debounceMs)
  }, [debounceMs, resetPagination])

  const swrKey = buildUrl(debouncedQuery)
  const { data, error, isLoading, isValidating, mutate } = useSWR<TResponse>(
    swrKey,
    fetcher,
    {
      onSuccess: (response) => {
        const page = selectInitialPage(response)
        setPages([page.items])
        setNextPageInfo(page.nextPageInfo)
        onInitialLoad?.(response)
      },
      keepPreviousData: true,
      revalidateOnFocus: false,
    },
  )

  const loadMore = useCallback(async () => {
    if (!nextPageInfo || isLoadingMore) return
    setIsLoadingMore(true)
    setLoadMoreError(null)
    try {
      const page = await fetchPage(nextPageInfo)
      setPages(prev => [...prev, page.items])
      setNextPageInfo(page.nextPageInfo)
    } catch (loadError) {
      setLoadMoreError(errorMessageFromUnknown(loadError, loadMoreErrorMessage))
    } finally {
      setIsLoadingMore(false)
    }
  }, [fetchPage, isLoadingMore, loadMoreErrorMessage, nextPageInfo])

  const mapItems = useCallback((mapper: (item: TItem) => TItem) => {
    setPages(prev => prev.map(page => page.map(mapper)))
  }, [])

  const isSearchMode = searchMinLength > 0
    ? debouncedQuery.length >= searchMinLength
    : debouncedQuery.length > 0

  return {
    allItems: pages.flat(),
    data,
    debouncedQuery,
    error,
    handleSearchChange,
    isLoading,
    isLoadingMore,
    isSearchMode,
    isValidating,
    loadMore,
    loadMoreError,
    mapItems,
    mutate,
    nextPageInfo,
    pages,
    resetPagination,
    resetSearch,
    searchQuery,
  }
}
