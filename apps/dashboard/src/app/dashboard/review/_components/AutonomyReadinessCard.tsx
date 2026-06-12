"use client"

import useSWR from "swr"
import Link from "next/link"
import { ShieldCheck, AlertTriangle } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"
import { TOOL_LABELS } from "@shopkeeper/agent/tools"

interface ReadinessSlice {
  resolved: number
  agreements: number
  agreementRate: number | null
  dangerousRejections: number
}

interface AutonomyReadiness extends ReadinessSlice {
  windowSize: number
  pending: number
  byTier: (ReadinessSlice & { tier: string })[]
  byTool: (ReadinessSlice & { tool: string })[]
}

function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`
}

export default function AutonomyReadinessCard() {
  const { data } = useSWR<AutonomyReadiness>("/api/agent/autonomy-readiness", fetcher, {
    revalidateOnFocus: false,
  })

  // Only relevant once the org is in shadow mode and has produced counterfactuals.
  if (!data || (data.resolved === 0 && data.pending === 0)) return null

  return (
    <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-emerald-300" />
        <h2 className="text-sm font-semibold text-white/80">Trust readiness</h2>
        <span className="ml-auto text-xs text-white/30">last {data.resolved} of {data.windowSize}</span>
      </div>
      <p className="mt-0.5 text-xs text-white/40">
        How often the agent&apos;s would-be auto-action matched what you approved. Watched before going live.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
          <p className="text-xs text-white/40">Agreement</p>
          <p className="text-lg font-semibold text-white">{pct(data.agreementRate)}</p>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
          <p className="text-xs text-white/40">Pending</p>
          <p className="text-lg font-semibold text-white/80">{data.pending}</p>
        </div>
        <div className={`rounded-lg border p-2.5 ${data.dangerousRejections > 0 ? "border-amber-800/40 bg-amber-900/[0.12]" : "border-white/[0.06] bg-white/[0.02]"}`}>
          <div className="flex items-center gap-1">
            {data.dangerousRejections > 0 && <AlertTriangle className="size-3 text-amber-300" />}
            <p className={`text-xs ${data.dangerousRejections > 0 ? "text-amber-300" : "text-white/40"}`}>Rejected</p>
          </div>
          <p className={`text-lg font-semibold ${data.dangerousRejections > 0 ? "text-amber-200" : "text-white/80"}`}>
            {data.dangerousRejections}
          </p>
        </div>
      </div>

      {data.byTier.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/35 mb-1.5">By tier</p>
          <div className="space-y-1">
            {data.byTier.map((row) => (
              <div key={row.tier} className="flex items-baseline gap-2 text-xs">
                <span className="font-medium text-white/55 capitalize w-16 shrink-0">{row.tier}</span>
                <span className="text-white/70">{pct(row.agreementRate)}</span>
                <span className="text-white/30">({row.agreements}/{row.resolved})</span>
                {row.dangerousRejections > 0 && (
                  <span className="ml-auto text-amber-300">{row.dangerousRejections} rejected</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.byTool.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/35 mb-1.5">By tool</p>
          <div className="space-y-1">
            {data.byTool.map((row) => (
              <div key={row.tool} className="flex items-baseline gap-2 text-xs">
                <span className="font-medium text-white/55 w-32 shrink-0 truncate">{TOOL_LABELS[row.tool] ?? row.tool}</span>
                <span className="text-white/70">{pct(row.agreementRate)}</span>
                <span className="text-white/30">({row.agreements}/{row.resolved})</span>
                {row.dangerousRejections > 0 && (
                  <span className="ml-auto text-amber-300">{row.dangerousRejections} rejected</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Link
          href="/dashboard/settings?tab=agent"
          className="text-xs font-semibold text-white/45 hover:text-white transition-colors"
        >
          Adjust trust level in Settings →
        </Link>
      </div>
    </div>
  )
}
