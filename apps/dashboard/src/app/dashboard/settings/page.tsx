import { getOrCreateOrg } from "@/lib/org"
import SettingsPageClient from "./_components/SettingsPageClient"
import type { OrgSettings } from "@/types"

export default async function SettingsPage() {
  const org = await getOrCreateOrg()
  const settings = ((org.settings as OrgSettings | null) ?? { aiContext: "", brandVoice: "" }) as OrgSettings

  return (
    <SettingsPageClient
      orgName={org.name}
      settings={settings}
    />
  )
}
