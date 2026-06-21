"use client"

import { Suspense } from "react"
import QualityPanel from "./QualityPanel"

export default function ReviewPageClient({ agentName }: { agentName: string }) {
  return (
    <Suspense fallback={null}>
      <ReviewPageContent agentName={agentName} />
    </Suspense>
  )
}

function ReviewPageContent({ agentName }: { agentName: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <QualityPanel agentName={agentName} />
    </div>
  )
}
