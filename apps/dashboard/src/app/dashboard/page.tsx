import { currentUser } from "@clerk/nextjs/server"
import { getOrCreateOrg } from "@/lib/server/org"
import { getHomeSummary } from "@/lib/server/home-summary"
import DashboardHomeClient from "./_components/home/DashboardHomeClient"
import type { OrgSettings } from "@/types"

export default async function DashboardPage() {
  const [org, user] = await Promise.all([getOrCreateOrg(), currentUser()])
  const initialSummary = await getHomeSummary(org.id, org.settings as Partial<OrgSettings> | null)

  const userName = user?.firstName ?? user?.fullName ?? "there"

  return (
    <DashboardHomeClient
      userName={userName}
      initialSummary={initialSummary}
    />
  )
}
