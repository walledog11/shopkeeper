import { Suspense } from "react"
import { getOrCreateOrg } from "@/lib/server/org"
import { resolveAgentSettings } from "@/lib/agent/settings"
import SettingsPageClient from "./_components/SettingsPageClient"
import type { OrgSettings } from "@/types"

export default async function SettingsPage() {
  const org = await getOrCreateOrg()
  const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null)

  return (
    <Suspense fallback={null}>
      <SettingsPageClient
        orgName={org.name}
        settings={settings}
      />
    </Suspense>
  )
}
