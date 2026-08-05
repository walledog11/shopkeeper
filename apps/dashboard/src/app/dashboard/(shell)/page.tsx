import { currentUser } from "@clerk/nextjs/server"
import type { OrgSettings } from "@/types"
import { getOrCreateOrg } from "@/lib/server/org"
import { getHomeSummary } from "@/lib/server/home-summary"
import DashboardHomeClient from "../_components/home/DashboardHomeClient"

export default async function DashboardPage() {
  const user = await currentUser()
  const org = await getOrCreateOrg()
  const initialHomeSummary = await getHomeSummary(
    org.id,
    org.settings as Partial<OrgSettings> | null,
  )

  const userName = user?.firstName ?? user?.fullName ?? ""

  return (
    <DashboardHomeClient
      userName={userName}
      initialHomeSummary={initialHomeSummary}
    />
  )
}
