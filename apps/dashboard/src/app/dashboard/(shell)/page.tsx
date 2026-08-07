import { auth, currentUser } from "@clerk/nextjs/server"
import { cookies } from "next/headers"
import { localGreeting, resolveAgentSettings } from "@shopkeeper/agent/settings"
import type { OrgSettings } from "@/types"
import { isInstagramIntegrationEnabledForOrg } from "@/lib/env"
import {
  readWorkflowBannerDismissed,
  readWorkflowBannerExpanded,
  WORKFLOW_BANNER_DISMISSAL_COOKIE,
  WORKFLOW_BANNER_EXPANDED_COOKIE,
} from "@/lib/dashboard-dismissals"
import { getOrCreateOrg } from "@/lib/server/org"
import { getHomeChannelState, getHomeSummary } from "@/lib/server/home-summary"
import DashboardHomeClient from "../_components/home/DashboardHomeClient"

export default async function DashboardPage() {
  const { orgId, userId } = await auth()
  const user = await currentUser()
  const org = await getOrCreateOrg()
  const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null)
  const cookieStore = await cookies()
  const workflowBannerDismissed = readWorkflowBannerDismissed(
    cookieStore.get(WORKFLOW_BANNER_DISMISSAL_COOKIE)?.value,
  )
  const workflowBannerExpanded = readWorkflowBannerExpanded(
    cookieStore.get(WORKFLOW_BANNER_EXPANDED_COOKIE)?.value,
  )
  const [initialHomeSummary, initialChannelState] = await Promise.all([
    getHomeSummary(org.id, org.settings as Partial<OrgSettings> | null),
    getHomeChannelState(org.id, userId),
  ])

  const userName = user?.firstName ?? user?.fullName ?? ""
  const greeting = localGreeting(settings.businessHoursTimezone ?? "UTC")

  return (
    <DashboardHomeClient
      userName={userName}
      agentName={settings.agentName}
      greeting={greeting}
      initialHomeSummary={initialHomeSummary}
      initialChannelState={initialChannelState}
      workflowBannerDismissed={workflowBannerDismissed}
      workflowBannerExpanded={workflowBannerExpanded}
      instagramAvailable={isInstagramIntegrationEnabledForOrg(orgId)}
    />
  )
}
