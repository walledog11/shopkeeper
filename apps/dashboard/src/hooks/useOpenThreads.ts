import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Thread } from "@/types";

export function useOpenThreads() {
  const { data: threads, error, isLoading, mutate } = useSWR<Thread[]>(
    "/api/threads",
    fetcher,
    { refreshInterval: 3000 }
  );

  return {
    threads: threads ?? [],
    openCount: threads?.length ?? 0,
    isLoading,
    error,
    mutate,
  };
}
