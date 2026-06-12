import useSWR from "swr";
import { useEffect, useState, useCallback } from "react";
import { fetcher } from "@/lib/api/fetcher";
import type { Thread } from "@/types";

type ThreadsPage = { threads: Thread[]; nextCursor: string | null };
type ThreadCount = { count: number };

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

export function useOpenThreadCountQuery(enabled = true) {
  const isVisible = useIsDocumentVisible();
  const { data, error, isLoading, mutate } = useSWR<ThreadCount>(
    enabled ? '/api/threads?status=open&count=true' : null,
    fetcher,
    { refreshInterval: isVisible ? 15000 : 0 }
  );

  return {
    count: data?.count ?? 0,
    isLoading,
    error,
    mutate,
  };
}
