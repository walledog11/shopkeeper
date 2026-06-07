import { Suspense } from "react"
import { db, SenderType } from "@shopkeeper/db"
import { getOrCreateOrg } from "@/lib/server/org"
import { resolveAgentSettings } from "@shopkeeper/agent/settings"
import { canonicalInboxThreadWhere } from "@/lib/messaging/inbox-filter"
import TicketsPageClient from "./_components/TicketsPageClient"
import type { Thread, OrgSettings } from "@/types"

export default async function TicketsPage() {
  const org = await getOrCreateOrg()

  const [openThreadsRaw, integrations] = await Promise.all([
    db.thread.findMany({
      where: {
        ...canonicalInboxThreadWhere(org.id),
        status: "open",
      },
      include: {
        customer: true,
        messages: {
          where: { NOT: { senderType: SenderType.note }, deletedAt: null },
          orderBy: { sentAt: "desc" },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 25,
    }),
    db.integration.findMany({
      where: { organizationId: org.id },
      select: { platform: true },
    }),
  ])

  const initialOpenThreads: Thread[] = JSON.parse(JSON.stringify(openThreadsRaw))
  const hasShopify = integrations.some(i => i.platform === "shopify")
  const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null)

  return (
    <Suspense fallback={null}>
      <TicketsPageClient
        initialOpenThreads={initialOpenThreads}
        hasShopify={hasShopify}
        agentName={settings.agentName}
      />
    </Suspense>
  )
}
