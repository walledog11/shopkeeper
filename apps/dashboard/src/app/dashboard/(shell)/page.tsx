import { currentUser } from "@clerk/nextjs/server"
import { createEmptyHomeSummary } from "@/lib/home/summary-contract"
import DashboardHomeClient from "../_components/home/DashboardHomeClient"

export default async function DashboardPage() {
  const user = await currentUser()
  const initialSummary = createEmptyHomeSummary()

  const userName = user?.firstName ?? user?.fullName ?? ""

  return (
    <DashboardHomeClient
      userName={userName}
      initialSummary={initialSummary}
    />
  )
}
