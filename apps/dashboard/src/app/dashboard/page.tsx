import { currentUser } from "@clerk/nextjs/server"
import { db } from "@clerk/db"
import { getOrCreateOrg } from "@/lib/org"
import DashboardHomeClient from "./_components/DashboardHomeClient"
import type { Thread } from "@/types"

export default async function DashboardPage() {
  const [org, user] = await Promise.all([getOrCreateOrg(), currentUser()])

  const [openThreadsRaw, closedThreadsRaw] = await Promise.all([
    db.thread.findMany({
      where: { organizationId: org.id, status: "open" },
      include: { customer: true, messages: { orderBy: { sentAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.thread.findMany({
      where: { organizationId: org.id, status: "closed" },
      include: { customer: true, messages: { orderBy: { sentAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
    }),
  ])

  // Serialize Dates to ISO strings to match the Thread type
  const serialize = (threads: typeof openThreadsRaw): Thread[] =>
    JSON.parse(JSON.stringify(threads))

  const userName = user?.firstName ?? user?.fullName ?? "there"

  return (
    <DashboardHomeClient
      userName={userName}
      initialOpenThreads={serialize(openThreadsRaw)}
      initialClosedThreads={serialize(closedThreadsRaw)}
    />
  )
}
