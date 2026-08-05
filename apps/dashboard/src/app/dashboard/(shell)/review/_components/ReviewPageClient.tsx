"use client"

import { Suspense } from "react"
import { ReviewPageSkeleton } from "@/app/dashboard/_components/skeletons"
import QualityPanel from "./QualityPanel"

export default function ReviewPageClient() {
  return (
    <Suspense fallback={<ReviewPageSkeleton />}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <QualityPanel />
      </div>
    </Suspense>
  )
}
