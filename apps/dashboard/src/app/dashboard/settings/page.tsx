import { Suspense } from "react"
import { parseVoiceProposal } from "@shopkeeper/db"
import { normalizeStoredOrgSettings } from "@shopkeeper/agent/settings"
import { getOrCreateOrg } from "@/lib/server/org"
import { resolveAgentSettings } from "@shopkeeper/agent/settings"
import SettingsPageClient from "./_components/SettingsPageClient"

export default async function SettingsPage() {
  const org = await getOrCreateOrg()
  const rawSettings = normalizeStoredOrgSettings(org.settings)
  const settings = resolveAgentSettings(rawSettings)

  return (
    <Suspense fallback={null}>
      <SettingsPageClient
        orgName={org.name}
        settings={settings}
        rawSettings={rawSettings}
        version={org.updatedAt.toISOString()}
        voiceProposal={parseVoiceProposal(org.voiceProposal)}
      />
    </Suspense>
  )
}
