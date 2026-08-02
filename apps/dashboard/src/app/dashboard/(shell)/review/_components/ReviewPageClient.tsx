"use client"

import { Suspense } from "react"
import QualityPanel from "./QualityPanel"

export default function ReviewPageClient() {
  return (
    <Suspense fallback={null}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <QualityPanel />
      </div>
    </Suspense>
  )
}
