"use client"

import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { InsightsTabBar } from "@/components/dashboard/InsightsTabBar"
import AuditPanel from "./AuditPanel"
import QualityPanel from "./QualityPanel"

const TABS = [
  { id: "quality", label: "Quality" },
  { id: "audit", label: "Audit" },
] as const

type ReviewTab = (typeof TABS)[number]["id"]

function isReviewTab(value: string | null): value is ReviewTab {
  return value === "quality" || value === "audit"
}

function ReviewPageContent() {
  const searchParams = useSearchParams()
  const { replace } = useRouter()
  const tabParam = searchParams.get("tab")
  const activeTab: ReviewTab = isReviewTab(tabParam) ? tabParam : "quality"

  function setTab(tab: ReviewTab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    replace(`/dashboard/review?${params.toString()}`)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 border-b border-white/[0.06]">
        <h1 className="text-lg font-semibold text-white">Review</h1>
        <p className="text-sm text-white/40 mt-0.5">
          Spot-check AI output quality and inspect every agent action.
        </p>
        <InsightsTabBar
          tabs={TABS}
          active={activeTab}
          onChange={setTab}
          variant="dark"
          className="mt-3"
        />
      </div>

      {activeTab === "quality" ? <QualityPanel /> : <AuditPanel />}
    </div>
  )
}

export default function ReviewPageClient() {
  return (
    <Suspense fallback={null}>
      <ReviewPageContent />
    </Suspense>
  )
}
