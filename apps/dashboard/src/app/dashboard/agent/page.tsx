import { getOrCreateOrg } from "@/lib/server/org"
import { resolveAgentSettings } from "@/lib/agent/settings"
import type { OrgSettings } from "@/types"
import AgentPageClient from "./_components/AgentPageClient"

export default async function AgentPage() {
  const org = await getOrCreateOrg()
  const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null)

  return <AgentPageClient agentName={settings.agentName} />
}
