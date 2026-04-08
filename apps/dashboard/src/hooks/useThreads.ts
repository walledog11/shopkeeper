import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { useEffect, useState, useCallback } from "react";
import { fetcher } from "@/lib/fetcher";
import type { Thread } from "@/types";

const PAGINATED_LIMIT = 25;

type ThreadsPage = { threads: Thread[]; nextCursor: string | null };

function useIsDocumentVisible() {
  const [isVisible, setIsVisible] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );

  useEffect(() => {
    const handler = () => setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return isVisible;
}

// Non-paginated — for analytics and other pages that need all threads
export function useThreads(
  status: 'open' | 'closed' = 'open',
  fallbackData?: Thread[],
  enabled = true,
  preview = false,
) {
  const isVisible = useIsDocumentVisible();
  const key = enabled
    ? `/api/threads?status=${status}${preview ? '&preview=true' : ''}`
    : null;

  const baseInterval = status === 'open' ? 15000 : 60000;

  const fbData: ThreadsPage | undefined = fallbackData
    ? { threads: fallbackData, nextCursor: null }
    : undefined;

  const { data, error, isLoading, mutate: swrMutate } = useSWR<ThreadsPage>(
    key,
    fetcher,
    { refreshInterval: isVisible ? baseInterval : 0, fallbackData: fbData }
  );

  const mutate = useCallback(async (updater?: Thread[], revalidate = true): Promise<Thread[] | undefined> => {
    if (updater === undefined) {
      const result = await swrMutate();
      return result?.threads;
    }
    const result = await swrMutate({ threads: updater, nextCursor: data?.nextCursor ?? null }, revalidate);
    return result?.threads;
  }, [swrMutate, data?.nextCursor]);

  return {
    threads: data?.threads ?? [],
    isLoading,
    error,
    mutate,
  };
}

// Paginated — for the tickets list; uses cursor-based infinite loading
export function usePaginatedThreads(
  status: 'open' | 'closed' = 'open',
  initialData?: Thread[],
  preview = false,
) {
  const isVisible = useIsDocumentVisible();
  const baseInterval = status === 'open' ? 15000 : 60000;

  const getKey = (pageIndex: number, previousPageData: ThreadsPage | null) => {
    if (previousPageData && !previousPageData.nextCursor) return null;
    const base = `/api/threads?status=${status}&limit=${PAGINATED_LIMIT}${preview ? '&preview=true' : ''}`;
    if (pageIndex === 0) return base;
    return `${base}&cursor=${previousPageData!.nextCursor}`;
  };

  const fbData: ThreadsPage[] | undefined = initialData
    ? [{ threads: initialData, nextCursor: null }]
    : undefined;

  const { data: pages, error, isLoading, size, setSize, mutate: swrMutate } = useSWRInfinite<ThreadsPage>(
    getKey,
    fetcher,
    {
      refreshInterval: isVisible ? baseInterval : 0,
      fallbackData: fbData,
      revalidateFirstPage: true,
    }
  );

  const threads: Thread[] = pages?.flatMap(p => p.threads) ?? [];
  const lastPage = pages?.[pages.length - 1];
  const hasMore = !!(lastPage?.nextCursor);
  const isLoadingMore = size > (pages?.length ?? 0);

  const loadMore = useCallback(() => setSize(s => s + 1), [setSize]);

  const mutate = useCallback(async (updater?: Thread[], revalidate = true): Promise<Thread[] | undefined> => {
    if (updater === undefined) {
      const result = await swrMutate();
      return result?.flatMap(p => p.threads);
    }
    const result = await swrMutate(
      (currentPages = []) => currentPages.map(page => ({
        ...page,
        threads: page.threads.map(t => updater.find(u => u.id === t.id) ?? t),
      })),
      revalidate
    );
    return result?.flatMap(p => p.threads);
  }, [swrMutate]);

  return {
    threads,
    isLoading,
    error,
    mutate,
    loadMore,
    hasMore,
    isLoadingMore,
  };
}

export const useOpenThreads = () => useThreads('open', undefined, true, true);

