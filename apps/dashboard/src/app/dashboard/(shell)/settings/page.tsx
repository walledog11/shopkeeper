import { Suspense } from "react"
import { SettingsPageSkeleton } from "@/app/dashboard/_components/skeletons"
import { getOrCreateOrg } from "@/lib/server/org"
import SettingsPageClient from "./_components/SettingsPageClient"

export default async function SettingsPage() {
  const org = await getOrCreateOrg()

  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <SettingsPageClient orgName={org.name} version={org.updatedAt.toISOString()} />
    </Suspense>
  )
}
