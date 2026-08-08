"use client"

import { Suspense } from "react"
import type { ActionLogPage } from "@/hooks/useActionLogEntries"
import { ReviewPageSkeleton } from "@/app/dashboard/_components/skeletons"
import QualityPanel from "./QualityPanel"

export default function ReviewPageClient({
  initialActionLogPage,
}: {
  initialActionLogPage?: ActionLogPage
}) {
  return (
    <Suspense fallback={<ReviewPageSkeleton />}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <QualityPanel initialActionLogPage={initialActionLogPage} />
      </div>
    </Suspense>
  )
}
