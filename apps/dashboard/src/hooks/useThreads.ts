import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Thread } from "@/types";

export function useThreads(status: 'open' | 'closed' = 'open', fallbackData?: Thread[]) {
  const { data, error, isLoading, mutate } = useSWR<Thread[]>(
    `/api/threads?status=${status}`,
    fetcher,
    { refreshInterval: status === 'open' ? 8000 : 20000, fallbackData }
  );

  return {
    threads: data ?? [],
    isLoading,
    error,
    mutate,
  };
}

export const useOpenThreads = () => useThreads('open');
