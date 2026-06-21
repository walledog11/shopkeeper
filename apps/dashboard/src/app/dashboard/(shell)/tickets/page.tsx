import { Suspense } from "react"
import { ChannelType, db, SenderType } from "@shopkeeper/db"
import { getOrCreateOrg } from "@/lib/server/org"
import { resolveAgentSettings } from "@shopkeeper/agent/settings"
import { listThreadIdsBySqlFilters } from "@/lib/messaging/thread-list-query"
import TicketsPageClient from "./_components/TicketsPageClient"
import type { Thread, OrgSettings } from "@/types"

const INBOX_CHANNEL_TYPES: ChannelType[] = [ChannelType.email, ChannelType.ig_dm, ChannelType.imessage]

export default async function TicketsPage() {
  const org = await getOrCreateOrg()

  const [{ ids: forMeIds }, integrations] = await Promise.all([
    listThreadIdsBySqlFilters(org.id, { forMe: true, status: "open" }, { limit: 25 }),
    db.integration.findMany({
      where: { organizationId: org.id },
      select: { platform: true },
    }),
  ])

  const forMeThreadsRaw = forMeIds.length > 0
    ? await db.thread.findMany({
        where: { id: { in: forMeIds } },
        include: {
          customer: true,
          messages: {
            where: { NOT: { senderType: SenderType.note }, deletedAt: null },
            orderBy: { sentAt: "desc" },
            take: 1,
          },
        },
      })
    : []

  const byId = new Map(forMeThreadsRaw.map(thread => [thread.id, thread]))
  const initialForMeThreads: Thread[] = JSON.parse(JSON.stringify(
    forMeIds.flatMap((id: string) => {
      const thread = byId.get(id)
      return thread ? [thread] : []
    }),
  ))

  const connectedChannels = INBOX_CHANNEL_TYPES.filter(channel =>
    integrations.some(integration => integration.platform === channel),
  )
  const hasShopify = integrations.some(i => i.platform === "shopify")
  const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null)

  return (
    <Suspense fallback={null}>
      <TicketsPageClient
        initialForMeThreads={initialForMeThreads}
        hasShopify={hasShopify}
        agentName={settings.agentName}
        connectedChannels={connectedChannels}
        orgSettings={org.settings as Partial<OrgSettings> | null}
      />
    </Suspense>
  )
}
