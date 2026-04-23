import useSWR from 'swr'
import { fetcher } from '@/lib/api/fetcher'

export interface ReportsData {
  window: { from: string; to: string }
  support: {
    total: number
    closed: number
    openAndPending: number
    resolutionRate: number
    avgFirstReplyMinutes: number | null
    firstReplyCount: number
    byChannel: { channel: string; count: number }[]
    byTag: { tag: string; count: number }[]
  }
  agent: {
    totalRuns: number
    refundsIssued: number
    cancellations: number
    orderEdits: number
    ordersCreated: number
    repliesSent: number
    addressUpdates: number
    topTools: { tool: string; count: number }[]
  }
  customers: {
    unique: number
    repeat: number
    top: { name: string | null; platformId: string; count: number }[]
  }
}

export function useReports(from: Date, to: Date) {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
  const { data, error, isLoading } = useSWR<ReportsData>(
    `/api/reports?${params}`,
    fetcher,
    { refreshInterval: 120_000 },
  )
  return { data, isLoading, error }
}
