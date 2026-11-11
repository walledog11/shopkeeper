import type { Metadata } from "next"
import { listAgentActionLogEntries } from "@/lib/agent/api/action-log"
import { getOrCreateOrg } from "@/lib/server/org"
import ReviewPageClient from "./_components/ReviewPageClient"

export const metadata: Metadata = { title: "Review" }

export default async function ReviewPage() {
  const org = await getOrCreateOrg()
  const initialActionLogPage = await listAgentActionLogEntries({ orgId: org.id })

  return <ReviewPageClient initialActionLogPage={initialActionLogPage} />
}
