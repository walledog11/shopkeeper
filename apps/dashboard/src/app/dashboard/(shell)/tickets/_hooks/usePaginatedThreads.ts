import { useCallback, useEffect, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { fetcher } from "@/lib/api/fetcher";
import { REALTIME_ENABLED } from "@/lib/realtime/config";
import type { ChannelType, Thread } from "@/types";

const PAGINATED_LIMIT = 25;

type ThreadsPage = { threads: Thread[]; nextCursor: string | null; totalCount?: number };

export type ThreadListQuery = {
  status?: "open" | "closed"
  filterStatus?: "filtered"
  forMe?: boolean
  hasDraft?: boolean
  tag?: string
  channelType?: ChannelType
}

function useIsDocumentVisible() {
  const [isVisible, setIsVisible] = useState(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true
  );

  useEffect(() => {
    const handler = () => setIsVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  return isVisible;
}

function buildThreadListUrl(query: ThreadListQuery, pageIndex: number, previousPageData: ThreadsPage | null, preview: boolean) {
  const params = new URLSearchParams();
  params.set("status", query.status ?? "open");
  params.set("limit", String(PAGINATED_LIMIT));
  if (preview) params.set("preview", "true");
  if (query.filterStatus) params.set("filterStatus", query.filterStatus);
  if (query.forMe) params.set("forMe", "true");
  if (query.hasDraft) params.set("hasDraft", "true");
  if (query.tag) params.set("tag", query.tag);
  if (query.channelType) params.set("channelType", query.channelType);
  if (pageIndex === 0) params.set("includeCount", "true");
  if (pageIndex > 0 && previousPageData?.nextCursor) {
    params.set("cursor", previousPageData.nextCursor);
  }
  return `/api/threads?${params.toString()}`;
}

function queryMatchesInitial(query: ThreadListQuery) {
  return Boolean(query.forMe)
    && !query.hasDraft
    && !query.tag
    && !query.channelType
    && !query.filterStatus
    && (query.status ?? "open") === "open"
}

export function usePaginatedThreads(
  query: ThreadListQuery,
  initialData?: Thread[],
  preview = false,
  enabled = true,
) {
  const isVisible = useIsDocumentVisible();
  const status = query.status ?? "open";
  const isPrimary = status === "open" && !query.filterStatus;
  const baseInterval = REALTIME_ENABLED
    ? (isPrimary ? 60000 : 120000)
    : (isPrimary ? 15000 : 60000);

  const getKey = (pageIndex: number, previousPageData: ThreadsPage | null) => {
    if (!enabled) return null;
    if (previousPageData && !previousPageData.nextCursor) return null;
    return buildThreadListUrl(query, pageIndex, previousPageData, preview);
  };

  const fbData: ThreadsPage[] | undefined = initialData && queryMatchesInitial(query)
    ? [{ threads: initialData, nextCursor: null }]
    : undefined;

  const { data: pages, error, isLoading, size, setSize, mutate: swrMutate } = useSWRInfinite<ThreadsPage>(
    getKey,
    fetcher,
    {
      refreshInterval: isVisible && enabled ? baseInterval : 0,
      fallbackData: fbData,
      revalidateFirstPage: true,
    }
  );

  const threads: Thread[] = pages?.flatMap(page => page.threads) ?? [];
  const totalCount = pages?.[0]?.totalCount;
  const lastPage = pages?.[pages.length - 1];
  const hasMore = !!lastPage?.nextCursor;
  const isLoadingMore = size > (pages?.length ?? 0);

  const loadMore = useCallback(() => setSize(currentSize => currentSize + 1), [setSize]);

  const removeThreadById = useCallback(async (id: string) => {
    await swrMutate(
      (currentPages = []) => currentPages.map(page => ({
        ...page,
        threads: page.threads.filter(t => t.id !== id),
      })),
      false,
    )
  }, [swrMutate])

  const prependThread = useCallback(async (thread: Thread) => {
    await swrMutate(
      (currentPages = []) => {
        if (currentPages.length === 0) return [{ threads: [thread], nextCursor: null }]
        return currentPages.map((page, i) => i === 0
          ? { ...page, threads: [thread, ...page.threads.filter(t => t.id !== thread.id)] }
          : { ...page, threads: page.threads.filter(t => t.id !== thread.id) })
      },
      false,
    )
  }, [swrMutate])

  const mutate = useCallback(async (updater?: Thread[], revalidate = true): Promise<Thread[] | undefined> => {
    if (updater === undefined) {
      const result = await swrMutate();
      return result?.flatMap(page => page.threads);
    }

    const result = await swrMutate(
      (currentPages = []) => currentPages.map(page => ({
        ...page,
        threads: page.threads.map(thread => updater.find(updated => updated.id === thread.id) ?? thread),
      })),
      revalidate
    );
    return result?.flatMap(page => page.threads);
  }, [swrMutate]);

  return {
    threads,
    totalCount,
    isLoading,
    error,
    mutate,
    removeThreadById,
    prependThread,
    loadMore,
    hasMore,
    isLoadingMore,
  };
}
