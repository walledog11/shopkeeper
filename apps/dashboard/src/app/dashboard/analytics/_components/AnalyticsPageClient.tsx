"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector"
import { InsightsTabBar } from "@/components/dashboard/InsightsTabBar"
import {
  getDateRangeFrom,
  getDateRangeTo,
  type DateRangePreset as Preset,
} from "@/lib/analytics/date-range"
import { AnalyticsExportPanel } from "./AnalyticsExportPanel"
import { AnalyticsOverviewPanel } from "./AnalyticsOverviewPanel"

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "export", label: "Export" },
] as const

type AnalyticsTab = (typeof TABS)[number]["id"]

function isAnalyticsTab(value: string | null): value is AnalyticsTab {
  return value === "overview" || value === "export"
}

function AnalyticsPageContent() {
  const searchParams = useSearchParams()
  const { replace } = useRouter()
  const tabParam = searchParams.get("tab")
  const activeTab: AnalyticsTab = isAnalyticsTab(tabParam) ? tabParam : "overview"

  const [preset, setPreset] = useState<Preset>("7d")
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split("T")[0]
  })
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().split("T")[0])

  const rangeFrom = getDateRangeFrom(preset, customFrom)
  const rangeTo = getDateRangeTo(preset, customTo)
  const today = new Date().toISOString().split("T")[0]

  function setTab(tab: AnalyticsTab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    replace(`/dashboard/analytics?${params.toString()}`)
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-5 md:px-6 py-4 space-y-3 pb-10">
        <div>
          <h1 className="text-lg font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Support metrics and exportable reports.
          </p>
          <InsightsTabBar
            tabs={TABS}
            active={activeTab}
            onChange={setTab}
            variant="light"
            className="mt-3"
          />
        </div>

        <DateRangeSelector
          preset={preset}
          setPreset={setPreset}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
          today={today}
        />

        {activeTab === "overview" ? (
          <AnalyticsOverviewPanel preset={preset} rangeFrom={rangeFrom} rangeTo={rangeTo} />
        ) : (
          <AnalyticsExportPanel preset={preset} rangeFrom={rangeFrom} rangeTo={rangeTo} />
        )}
      </div>
    </div>
  )
}

export default function AnalyticsPageClient() {
  return (
    <Suspense fallback={null}>
      <AnalyticsPageContent />
    </Suspense>
  )
}
