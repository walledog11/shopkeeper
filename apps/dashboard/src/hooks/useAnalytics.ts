import useSWR from 'swr';
import { fetcher } from '@/lib/api/fetcher';

export interface AnalyticsData {
  window: { from: string; to: string }
  threads: {
    total: number
    byStatus: Record<string, number>
    byChannel: { channel: string; count: number }[]
    byTag: { tag: string; count: number }[]
    volumeByDay: { day: string; count: number }[]
  }
  messages: {
    total: number
    bySender: Record<string, number>
  }
  resolution: {
    avgMinutes: number | null
    closedCount: number
    rate: number
  }
  firstReply: {
    avgMinutes: number | null
    measuredCount: number
  }
  aiUsage: {
    aiReplies: number
    agentReplies: number
    aiReplyPct: number | null
  }
}

export function useAnalytics(from: Date, to: Date) {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  const { data, error, isLoading } = useSWR<AnalyticsData>(
    `/api/analytics?${params}`,
    fetcher,
    { refreshInterval: 60_000 },
  );
  return { data, isLoading, error };
}
