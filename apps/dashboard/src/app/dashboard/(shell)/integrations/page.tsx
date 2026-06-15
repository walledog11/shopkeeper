import { Suspense } from "react"
import IntegrationsPageClient from "./_components/IntegrationsPageClient"

export default function IntegrationsPage() {
  return (
    <Suspense fallback={null}>
      <IntegrationsPageClient />
    </Suspense>
  )
}
