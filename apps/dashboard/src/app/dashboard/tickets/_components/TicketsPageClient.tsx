"use client"

import { Suspense } from "react"
import { TicketsPageLayout } from "./TicketsPageLayout"
import { TicketsErrorState, TicketsLoadingState } from "./TicketsPageStates"
import { useTicketsPageView, type TicketsPageClientProps } from "./useTicketsPageView"

export default function TicketsPageClient(props: TicketsPageClientProps) {
  return (
    <Suspense fallback={null}>
      <TicketsPageContent {...props} />
    </Suspense>
  )
}

function TicketsPageContent(props: TicketsPageClientProps) {
  const view = useTicketsPageView(props)
  if (view.kind === "loading") return <TicketsLoadingState />
  if (view.kind === "error") return <TicketsErrorState />
  return <TicketsPageLayout {...view.layoutProps} />
}
