"use client"

import { Suspense } from "react"
import { InboxPageLayout } from "./InboxPageLayout"
import { TicketsErrorState } from "./TicketsPageStates"
import { useInboxPageView, type InboxPageClientProps } from "./useInboxPageView"

export default function InboxPageClient(props: InboxPageClientProps) {
  return (
    <Suspense fallback={null}>
      <InboxPageContent {...props} />
    </Suspense>
  )
}

function InboxPageContent(props: InboxPageClientProps) {
  const view = useInboxPageView(props)
  if (view.kind === "error") return <TicketsErrorState />
  return <InboxPageLayout {...view.layoutProps} />
}
