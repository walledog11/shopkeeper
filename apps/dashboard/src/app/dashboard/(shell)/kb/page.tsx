import { getOrCreateOrg } from "@/lib/server/org"
import { getKbPageData } from "@/lib/server/kb-page-data"
import KbPageClient from "./_components/KbPageClient"

export default async function KbPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string | string[] }>
}) {
  const org = await getOrCreateOrg()
  const [initialKbData, { book }] = await Promise.all([getKbPageData(org), searchParams])

  return <KbPageClient initialKbData={initialKbData} initialBookId={typeof book === "string" ? book : undefined} />
}
