import { db } from "@clerk/db"
import { getOrCreateOrg } from "@/lib/org"
import TicketsPageClient from "./_components/TicketsPageClient"
import type { Thread } from "@/types"

export default async function TicketsPage() {
  const org = await getOrCreateOrg()

  const openThreadsRaw = await db.thread.findMany({
    where: { organizationId: org.id, status: "open" },
    include: { customer: true, messages: { orderBy: { sentAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  })

  const initialOpenThreads: Thread[] = JSON.parse(JSON.stringify(openThreadsRaw))

  return <TicketsPageClient initialOpenThreads={initialOpenThreads} />
}
