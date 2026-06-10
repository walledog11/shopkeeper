import { useCallback, useEffect, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { fetcher } from "@/lib/api/fetcher";
import type { Thread } from "@/types";

const PAGINATED_LIMIT = 25;

type ThreadsPage = { threads: Thread[]; nextCursor: string | null };

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

export function usePaginatedThreads(
  status: "open" | "closed" = "open",
  initialData?: Thread[],
  preview = false,
  filterStatus?: "filtered",
  needsReply = false,
  active = true,
) {
  const isVisible = useIsDocumentVisible();
  const baseInterval = status === "open" ? 15000 : 60000;

  const getKey = (pageIndex: number, previousPageData: ThreadsPage | null) => {
    if (previousPageData && !previousPageData.nextCursor) return null;
    const filterParam = filterStatus ? `&filterStatus=${filterStatus}` : "";
    const needsReplyParam = needsReply ? "&needsReply=true" : "";
    const base = `/api/threads?status=${status}&limit=${PAGINATED_LIMIT}${preview ? "&preview=true" : ""}${filterParam}${needsReplyParam}`;
    if (pageIndex === 0) return base;
    return `${base}&cursor=${previousPageData!.nextCursor}`;
  };

  const fbData: ThreadsPage[] | undefined = initialData && !needsReply
    ? [{ threads: initialData, nextCursor: null }]
    : undefined;

  const { data: pages, error, isLoading, size, setSize, mutate: swrMutate } = useSWRInfinite<ThreadsPage>(
    getKey,
    fetcher,
    {
      refreshInterval: isVisible && active ? baseInterval : 0,
      fallbackData: fbData,
      revalidateFirstPage: true,
    }
  );

  const threads: Thread[] = pages?.flatMap(page => page.threads) ?? [];
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
