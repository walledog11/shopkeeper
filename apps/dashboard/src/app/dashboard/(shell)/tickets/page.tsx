import { Suspense } from "react"
import { ChannelType, db } from "@shopkeeper/db"
import { TicketsPageSkeleton } from "@/app/dashboard/_components/skeletons"
import { getOrCreateOrg } from "@/lib/server/org"
import TicketsPageClient from "./_components/TicketsPageClient"
import type { OrgSettings } from "@/types"

const INBOX_CHANNEL_TYPES: ChannelType[] = [ChannelType.email, ChannelType.ig_dm, ChannelType.tiktok]

// The thread list is owned by SWR on the client — it polls, paginates, and mutates
// in place. Fetching a first page here too only delayed the route with rows the
// client threw away on mount. Only the org-shaped props the first render needs
// (which are cheap and stable) are resolved server-side.
export default async function TicketsPage() {
  const org = await getOrCreateOrg()

  const integrations = await db.integration.findMany({
    where: { organizationId: org.id },
    select: { platform: true },
  })

  const connectedChannels = INBOX_CHANNEL_TYPES.filter(channel =>
    integrations.some(integration => integration.platform === channel),
  )
  const hasShopify = integrations.some(i => i.platform === "shopify")

  return (
    <Suspense fallback={<TicketsPageSkeleton />}>
      <TicketsPageClient
        hasShopify={hasShopify}
        connectedChannels={connectedChannels}
        orgSettings={org.settings as Partial<OrgSettings> | null}
      />
    </Suspense>
  )
}
