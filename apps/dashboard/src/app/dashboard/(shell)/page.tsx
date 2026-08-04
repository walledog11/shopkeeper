import { currentUser } from "@clerk/nextjs/server"
import DashboardHomeClient from "../_components/home/DashboardHomeClient"

export default async function DashboardPage() {
  const user = await currentUser()

  const userName = user?.firstName ?? user?.fullName ?? ""

  return <DashboardHomeClient userName={userName} />
}
