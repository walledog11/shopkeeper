import { getOrCreateOrg } from "@/lib/server/org"
import { resolveAgentSettings } from "@shopkeeper/agent/settings"
import type { OrgSettings } from "@/types"
import ReviewPageClient from "./_components/ReviewPageClient"

export default async function ReviewPage() {
  const org = await getOrCreateOrg()
  const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null)
  return <ReviewPageClient agentName={settings.agentName} />
}
