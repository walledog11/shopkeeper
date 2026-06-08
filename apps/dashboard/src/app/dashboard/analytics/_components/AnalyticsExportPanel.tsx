"use client"

import { useReports } from "@/hooks/useReports"
import { formatShortDate } from "@/lib/format/date"
import type { DateRangePreset as Preset } from "@/lib/analytics/date-range"
import { AgentActivityCard } from "@/app/dashboard/reports/_components/AgentActivityCard"
import { CustomerContactCard } from "@/app/dashboard/reports/_components/CustomerContactCard"
import { GdprExportSection } from "@/app/dashboard/reports/_components/GdprExportSection"
import { SupportSummaryCard } from "@/app/dashboard/reports/_components/SupportSummaryCard"
import { TopTopicsCard } from "@/app/dashboard/reports/_components/TopTopicsCard"
import { BADGE_LABELS } from "@/app/dashboard/reports/_components/reports-helpers"

interface Props {
  preset: Preset
  rangeFrom: Date
  rangeTo: Date
}

export function AnalyticsExportPanel({ preset, rangeFrom, rangeTo }: Props) {
  const rangeLabel =
    preset === "custom"
      ? `${formatShortDate(rangeFrom.toISOString())} – ${formatShortDate(rangeTo.toISOString())}`
      : BADGE_LABELS[preset]

  const { data, isLoading, error } = useReports(rangeFrom, rangeTo)

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-400 px-1">Failed to load report data. Please try again.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SupportSummaryCard data={data} isLoading={isLoading} rangeLabel={rangeLabel} />
        <AgentActivityCard data={data} isLoading={isLoading} rangeLabel={rangeLabel} />
        <CustomerContactCard data={data} isLoading={isLoading} rangeLabel={rangeLabel} />
        <TopTopicsCard data={data} isLoading={isLoading} rangeLabel={rangeLabel} />
      </div>

      <GdprExportSection />
    </div>
  )
}
