import { Suspense } from "react"
import { db } from "@shopkeeper/db"
import { TicketsPageSkeleton } from "@/app/dashboard/_components/skeletons"
import { getOrCreateOrg } from "@/lib/server/org"
import InboxPageClient from "./_components/InboxPageClient"
import type { OrgSettings } from "@/types"

// The stream is owned by SWR on the client — it polls, paginates, and mutates in
// place. Fetching a first page here too only delayed the route with rows the client
// threw away on mount. Only the org-shaped props the first render needs are
// resolved server-side.
export default async function TicketsPage() {
  const org = await getOrCreateOrg()

  const hasShopify = await db.integration.findFirst({
    where: { organizationId: org.id, platform: "shopify" },
    select: { id: true },
  })

  return (
    <Suspense fallback={<TicketsPageSkeleton />}>
      <InboxPageClient
        hasShopify={hasShopify !== null}
        orgSettings={org.settings as Partial<OrgSettings> | null}
      />
    </Suspense>
  )
}
