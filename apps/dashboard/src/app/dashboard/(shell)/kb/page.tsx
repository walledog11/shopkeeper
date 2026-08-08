import { getOrCreateOrg } from "@/lib/server/org"
import { getKbPageData } from "@/lib/server/kb-page-data"
import KbPageClient from "./_components/KbPageClient"

export default async function KbPage() {
  const org = await getOrCreateOrg()
  const initialKbData = await getKbPageData(org)

  return <KbPageClient initialKbData={initialKbData} />
}
