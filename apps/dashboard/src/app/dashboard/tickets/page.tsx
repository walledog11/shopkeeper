import { Suspense } from "react"
import { db } from "@clerk/db"
import { getOrCreateOrg } from "@/lib/server/org"
import { resolveAgentSettings } from "@/lib/agent/settings"
import TicketsPageClient from "./_components/TicketsPageClient"
import type { Thread, OrgSettings } from "@/types"

export default async function TicketsPage() {
  const org = await getOrCreateOrg()

  const [openThreadsRaw, integrations] = await Promise.all([
    db.thread.findMany({
      where: { organizationId: org.id, status: "open", channelType: { notIn: ["sms_agent", "dashboard_agent"] }, archivedAt: null },
      include: { customer: true, messages: { orderBy: { sentAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
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
