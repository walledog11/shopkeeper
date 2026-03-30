import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Thread } from "@/types";

export function useThreads(
  status: 'open' | 'closed' = 'open',
  fallbackData?: Thread[],
  enabled = true,
  preview = false,
) {
  const key = enabled
    ? `/api/threads?status=${status}${preview ? '&preview=true' : ''}`
    : null;

  const { data, error, isLoading, mutate } = useSWR<Thread[]>(
    key,
    fetcher,
    { refreshInterval: status === 'open' ? 15000 : 60000, fallbackData }
  );

  return {
    threads: data ?? [],
    isLoading,
    error,
    mutate,
  };
}

export const useOpenThreads = () => useThreads('open', undefined, true, true);
