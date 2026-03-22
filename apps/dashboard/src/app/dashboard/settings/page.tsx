import { currentUser } from "@clerk/nextjs/server"
import { getOrCreateOrg } from "@/lib/org"
import SettingsPageClient from "./_components/SettingsPageClient"
import type { OrgSettings } from "@/types"

export default async function SettingsPage() {
  const [org, user] = await Promise.all([getOrCreateOrg(), currentUser()])

  const settings = ((org.settings as OrgSettings | null) ?? { aiContext: "", brandVoice: "" }) as OrgSettings

  return (
    <SettingsPageClient
      orgName={org.name}
      settings={settings}
      userName={user?.fullName ?? user?.firstName ?? ""}
      userEmail={user?.primaryEmailAddress?.emailAddress ?? ""}
      userImageUrl={user?.imageUrl ?? null}
    />
  )
}
