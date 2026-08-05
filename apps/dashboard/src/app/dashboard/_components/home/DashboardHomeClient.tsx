"use client"

import WorkflowSetupBanner from "./WorkflowSetupBanner"
import HomeTelegramNudge from "./HomeTelegramNudge"
import ConciergeBriefing from "./ConciergeBriefing"
import NeedsYou from "./NeedsYou"
import ClearedOvernight from "./ClearedOvernight"
import { HomePageSkeleton } from "@/app/dashboard/_components/skeletons"
import type { HomeSummary } from "@/lib/home/summary-contract"
import { useHomeData } from "./useHomeData"

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

interface Props {
  userName: string
  initialHomeSummary: HomeSummary
}

export default function DashboardHomeClient({ userName, initialHomeSummary }: Props) {
  const greeting = getGreeting()
  const data = useHomeData(initialHomeSummary)

  if (data.isSummaryPending) {
    return <HomePageSkeleton />
  }

  return (
    <div className="@container h-full flex flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col min-h-full w-full max-w-2xl mx-auto px-5 md:px-6 lg:px-8 pt-3 pb-4 gap-3">

          <div className="flex flex-col gap-3 min-w-0">
            <ConciergeBriefing
              greeting={greeting}
              userName={userName}
              agentName={data.agentName}
              walkthroughItems={data.walkthroughItems}
              walkthroughCount={data.walkthroughCount}
              needsYouCount={data.needsYouCount}
              overnightClearedCount={data.overnightClearedCount}
              briefingChannels={data.briefingChannels}
              refundsPending={data.refundsPending}
              vipsInQueue={data.vipsInQueue}
              ordersToShip={data.ordersToShip}
            />

            <NeedsYou
              items={data.needsYouItems}
              agentName={data.agentName}
              onApproved={data.refreshHomeSummary}
            />

            <ClearedOvernight
              agentName={data.agentName}
              totalCount={data.overnightClearedCount}
              topics={data.clearedTopics}
            />
          </div>

          <WorkflowSetupBanner
            steps={data.workflowSteps}
          />

          <HomeTelegramNudge connected={data.hasPhoneBound} />
        </div>
      </div>
    </div>
  )
}
