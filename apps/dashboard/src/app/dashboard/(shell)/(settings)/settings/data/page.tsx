import { getOrCreateOrg } from "@/lib/server/org"
import WorkspaceTab from "../_components/workspace/WorkspaceTab"

export const metadata = { title: "Your data" }

export default async function DataAndPrivacySettingsPage() {
  const org = await getOrCreateOrg()
  return <WorkspaceTab orgName={org.name} version={org.updatedAt.toISOString()} />
}
