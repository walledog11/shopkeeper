import { currentUser } from "@clerk/nextjs/server"
import { db } from "@clerk/db"
import { getOrCreateOrg } from "@/lib/org"
import DashboardHomeClient from "./_components/home/DashboardHomeClient"
import type { Thread } from "@/types"

export default async function DashboardPage() {
  const [org, user] = await Promise.all([getOrCreateOrg(), currentUser()])

  const [openThreadsRaw, closedCount, totalMessageCount] = await Promise.all([
    db.thread.findMany({
      where: { organizationId: org.id, status: "open" },
      include: {
        customer: true,
        messages: {
          where: {
            NOT: { AND: [{ senderType: "note" }, { contentText: { startsWith: "__clerk_agent__" } }] },
          },
          orderBy: { sentAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.thread.count({ where: { organizationId: org.id, status: "closed" } }),
    db.message.count({ where: { thread: { organizationId: org.id } } }),
  ])

  const serialize = (threads: typeof openThreadsRaw): Thread[] =>
    JSON.parse(JSON.stringify(threads))

  const userName = user?.firstName ?? user?.fullName ?? "there"

  return (
    <DashboardHomeClient
      userName={userName}
      initialOpenThreads={serialize(openThreadsRaw)}
      initialClosedCount={closedCount}
      totalMessageCount={totalMessageCount}
    />
  )
}
