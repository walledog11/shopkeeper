"use client"

import { useCallback, useMemo } from "react"
import useSWRInfinite from "swr/infinite"
import { fetcher } from "@/lib/api/fetcher"
import type { ActionLogEntry } from "@/types"

export type ActionLogMode = NonNullable<ActionLogEntry["mode"]>

export interface ActionLogQueryFilters {
  channels?: string[]
  tools?: string[]
  modes?: ActionLogMode[]
  errorsOnly?: boolean
  from?: Date | string | null
  to?: Date | string | null
}

export interface ActionLogPage {
  entries: ActionLogEntry[]
  nextCursor: string | null
}

export interface UseActionLogEntriesOptions {
  refreshInterval?: number
  revalidateOnFocus?: boolean
}

const EMPTY_ACTION_LOG_FILTERS: ActionLogQueryFilters = {}

interface NormalizedActionLogFilters {
  channels: string[]
  tools: string[]
  modes: ActionLogMode[]
  errorsOnly: boolean
  from: string | null
  to: string | null
}

function normalizeDateParam(value: Date | string | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return value
}

function normalizeFilters(filters: ActionLogQueryFilters): NormalizedActionLogFilters {
  return {
    channels: filters.channels ?? [],
    tools: filters.tools ?? [],
    modes: filters.modes ?? [],
    errorsOnly: filters.errorsOnly ?? false,
    from: normalizeDateParam(filters.from),
    to: normalizeDateParam(filters.to),
  }
}

export function buildActionLogSearchParams(filters: ActionLogQueryFilters = {}): URLSearchParams {
  const normalized = normalizeFilters(filters)
  const params = new URLSearchParams()
  if (normalized.channels.length) params.set("channel", normalized.channels.join(","))
  if (normalized.tools.length) params.set("tool", normalized.tools.join(","))
  if (normalized.modes.length) params.set("mode", normalized.modes.join(","))
  if (normalized.errorsOnly) params.set("errorsOnly", "true")
  if (normalized.from) params.set("from", normalized.from)
  if (normalized.to) params.set("to", normalized.to)
  return params
}

function buildActionLogUrl(filters: ActionLogQueryFilters, cursor?: string | null): string {
  const params = buildActionLogSearchParams(filters)
  if (cursor) params.set("cursor", cursor)
  const qs = params.toString()
  return qs ? `/api/agent/actions?${qs}` : "/api/agent/actions"
}

export function useActionLogEntries(
  filters: ActionLogQueryFilters = EMPTY_ACTION_LOG_FILTERS,
  options: UseActionLogEntriesOptions = {},
) {
  const normalized = useMemo(
    () => normalizeFilters(filters),
    [filters],
  )

  const getKey = useCallback(
    (_pageIndex: number, previousPage: ActionLogPage | null): string | null => {
      if (previousPage && !previousPage.nextCursor) return null
      return buildActionLogUrl(normalized, previousPage?.nextCursor)
    },
    [normalized],
  )

  const {
    data,
    error,
    isLoading,
    isValidating,
    size,
    setSize,
    mutate,
  } = useSWRInfinite<ActionLogPage>(getKey, fetcher, {
    refreshInterval: options.refreshInterval ?? 0,
    revalidateOnFocus: options.revalidateOnFocus ?? false,
  })

  const entries = useMemo(() => data?.flatMap((page) => page.entries) ?? [], [data])
  const hasMore = data ? !!data[data.length - 1]?.nextCursor : false
  const isLoadingMore = size > 1 && isValidating

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return
    void setSize((current) => current + 1)
  }, [hasMore, isLoadingMore, setSize])

  const refresh = useCallback(() => {
    void mutate()
  }, [mutate])

  return {
    entries,
    pages: data,
    error,
    isLoading,
    isValidating,
    isLoadingMore,
    hasMore,
    loadMore,
    refresh,
    setSize,
  }
}
