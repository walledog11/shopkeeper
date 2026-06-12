import { Suspense } from "react"
import { parseVoiceProposal } from "@shopkeeper/db"
import { normalizeStoredOrgSettings, resolveAgentSettings } from "@shopkeeper/agent/settings"
import { getOrCreateOrg } from "@/lib/server/org"
import ConfigurePageClient from "./_components/ConfigurePageClient"

export default async function AgentConfigurePage() {
  const org = await getOrCreateOrg()
  const rawSettings = normalizeStoredOrgSettings(org.settings)
  const settings = resolveAgentSettings(rawSettings)

  return (
    <Suspense fallback={null}>
      <ConfigurePageClient
        orgName={org.name}
        settings={settings}
        rawSettings={rawSettings}
        version={org.updatedAt.toISOString()}
        voiceProposal={parseVoiceProposal(org.voiceProposal)}
      />
    </Suspense>
  )
}
