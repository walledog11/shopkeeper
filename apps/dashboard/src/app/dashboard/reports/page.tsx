"use client"

import { useState } from "react"
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector"
import { useReports } from "@/hooks/useReports"
import { getDateRangeFrom, getDateRangeTo, type DateRangePreset as Preset } from "@/lib/analytics/date-range"
import { AgentActivityCard } from "./_components/AgentActivityCard"
import { CustomerContactCard } from "./_components/CustomerContactCard"
import { GdprExportSection } from "./_components/GdprExportSection"
import { SupportSummaryCard } from "./_components/SupportSummaryCard"
import { TopTopicsCard } from "./_components/TopTopicsCard"
import { BADGE_LABELS, shortDate } from "./_components/reports-helpers"

export default function ReportsPage() {
  const [preset, setPreset] = useState<Preset>("30d")
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split("T")[0]
  })
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().split("T")[0])

  const rangeFrom = getDateRangeFrom(preset, customFrom)
  const rangeTo = getDateRangeTo(preset, customTo)

  const rangeLabel = preset === "custom"
    ? `${shortDate(rangeFrom.toISOString())} – ${shortDate(rangeTo.toISOString())}`
    : BADGE_LABELS[preset]

  const today = new Date().toISOString().split("T")[0]
  const { data, isLoading, error } = useReports(rangeFrom, rangeTo)

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-5 md:px-6 py-4 space-y-3 pb-10">
        <DateRangeSelector
          preset={preset}
          setPreset={setPreset}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
          today={today}
        />

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
    </div>
  )
}
