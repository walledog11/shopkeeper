"use client"

import { Suspense } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import {
  HOME_SUMMARY_REFRESH_INTERVAL_MS,
  type HomeSummary,
} from "@/lib/home/summary-contract"
import QualityPanel from "./QualityPanel"

export default function ReviewPageClient({ agentName }: { agentName: string }) {
  return (
    <Suspense fallback={null}>
      <ReviewPageContent agentName={agentName} />
    </Suspense>
  )
}

function FramingLine({ agentName }: { agentName: string }) {
  const { data } = useSWR<HomeSummary>("/api/home-summary", fetcher, {
    refreshInterval: HOME_SUMMARY_REFRESH_INTERVAL_MS,
    revalidateOnFocus: false,
  })

  if (!data) return null
  const handled = data.series.aiResolvedByDay.reduce((sum, n) => sum + n, 0)
  const total = data.metrics.weeklyVolume
  if (total === 0) return null

  return (
    <p className="text-sm text-white/60">
      {agentName} handled <span className="font-semibold text-white">{handled}</span> of{" "}
      <span className="font-semibold text-white">{total}</span> tickets this week without you.
    </p>
  )
}

function ReviewPageContent({ agentName }: { agentName: string }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 border-b border-white/[0.06] space-y-2">
        <div>
          <h1 className="text-lg font-semibold text-white">Review</h1>
          <p className="text-sm text-white/40 mt-0.5">
            Spot-check what {agentName} did on its own and make sure it sounds like you.
          </p>
        </div>
        <FramingLine agentName={agentName} />
      </div>

      <QualityPanel agentName={agentName} />
    </div>
  )
}
