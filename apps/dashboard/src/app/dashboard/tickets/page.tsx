import { db } from "@clerk/db"
import { getOrCreateOrg } from "@/lib/org"
import TicketsPageClient from "./_components/TicketsPageClient"
import type { Thread } from "@/types"

export default async function TicketsPage() {
  const org = await getOrCreateOrg()

  const [openThreadsRaw, integrations] = await Promise.all([
    db.thread.findMany({
      where: { organizationId: org.id, status: "open" },
      include: { customer: true, messages: { orderBy: { sentAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.integration.findMany({
      where: { organizationId: org.id },
      select: { platform: true },
    }),
  ])

  const initialOpenThreads: Thread[] = JSON.parse(JSON.stringify(openThreadsRaw))
  const hasShopify = integrations.some(i => i.platform === "shopify")

  return <TicketsPageClient initialOpenThreads={initialOpenThreads} hasShopify={hasShopify} />
}
