import useSWR from "swr";
import { useEffect, useState } from "react";
import { fetcher } from "@/lib/api/fetcher";
import { REALTIME_ENABLED } from "@/lib/realtime/config";

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

export function useOpenThreadCountQuery(enabled = true) {
  const isVisible = useIsDocumentVisible();
  const { data, error, isLoading, mutate } = useSWR<ThreadCount>(
    enabled ? '/api/threads?status=open&count=true' : null,
    fetcher,
    { refreshInterval: isVisible ? (REALTIME_ENABLED ? 60000 : 15000) : 0 }
  );

  return {
    count: data?.count ?? 0,
    isLoading,
    error,
    mutate,
  };
}
