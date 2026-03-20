import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Thread } from "@/types";

export function useThreads(status: 'open' | 'closed' = 'open') {
  const { data, error, isLoading, mutate } = useSWR<Thread[]>(
    `/api/threads?status=${status}`,
    fetcher,
    { refreshInterval: status === 'open' ? 3000 : 15000 }
  );

  return {
    threads: data ?? [],
    isLoading,
    error,
    mutate,
  };
}

// Keep old export for any other consumers
export const useOpenThreads = () => useThreads('open');
