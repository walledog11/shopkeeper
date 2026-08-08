import { listAgentActionLogEntries } from "@/lib/agent/api/action-log"
import { getOrCreateOrg } from "@/lib/server/org"
import ReviewPageClient from "./_components/ReviewPageClient"

export default async function ReviewPage() {
  const org = await getOrCreateOrg()
  const initialActionLogPage = await listAgentActionLogEntries({ orgId: org.id })

  return <ReviewPageClient initialActionLogPage={initialActionLogPage} />
}
