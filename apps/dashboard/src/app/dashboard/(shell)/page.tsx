import { auth, currentUser } from "@clerk/nextjs/server"
import { resolveAgentSettings } from "@shopkeeper/agent/settings"
import type { OrgSettings } from "@/types"
import { isInstagramIntegrationEnabledForOrg } from "@/lib/env"
import { getOrCreateOrg } from "@/lib/server/org"
import { getHomeSummary } from "@/lib/server/home-summary"
import DashboardHomeClient from "../_components/home/DashboardHomeClient"

export default async function DashboardPage() {
  const { orgId } = await auth()
  const user = await currentUser()
  const org = await getOrCreateOrg()
  const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null)
  const initialHomeSummary = await getHomeSummary(
    org.id,
    org.settings as Partial<OrgSettings> | null,
  )

  const userName = user?.firstName ?? user?.fullName ?? ""

  return (
    <DashboardHomeClient
      userName={userName}
      agentName={settings.agentName}
      initialHomeSummary={initialHomeSummary}
      instagramAvailable={isInstagramIntegrationEnabledForOrg(orgId)}
    />
  )
}
