import { currentUser } from "@clerk/nextjs/server"
import { db } from "@clerk/db"
import { getOrCreateOrg } from "@/lib/server/org"
import { agentTurnMessageFilter } from "@/lib/agent/api/action-log"
import DashboardHomeClient from "./_components/home/DashboardHomeClient"
import type { Thread } from "@/types"

export default async function DashboardPage() {
  const [org, user] = await Promise.all([getOrCreateOrg(), currentUser()])

  const [openThreadsRaw, closedCount, totalMessageCount] = await Promise.all([
    db.thread.findMany({
      where: { organizationId: org.id, status: "open", archivedAt: null, channelType: { notIn: ["sms_agent", "dashboard_agent"] } },
      include: {
        customer: true,
        messages: {
          where: {
            NOT: { AND: [agentTurnMessageFilter] },
          },
          orderBy: { sentAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.thread.count({ where: { organizationId: org.id, status: "closed", archivedAt: null } }),
    db.message.count({ where: { thread: { organizationId: org.id, archivedAt: null }, NOT: { senderType: "note" } } }),
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
