"use client"

import WorkflowSetupBanner from "./WorkflowSetupBanner"
import HomeTelegramNudge from "./HomeTelegramNudge"
import ConciergeBriefing from "./ConciergeBriefing"
import NeedsYou from "./NeedsYou"
import ClearedOvernight from "./ClearedOvernight"
import { useHomeData } from "./useHomeData"
import type { HomeSummary } from "@/lib/home/summary-contract"

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

interface Props {
  userName: string
  initialSummary: HomeSummary
}

export default function DashboardHomeClient({ userName, initialSummary }: Props) {
  const greeting = getGreeting()
  const data = useHomeData({ initialSummary })

  return (
    <div className="@container h-full flex flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col min-h-full w-full max-w-2xl mx-auto px-5 md:px-6 lg:px-8 pt-3 pb-4 gap-3">

          <WorkflowSetupBanner
            steps={data.workflowSteps}
          />

          <HomeTelegramNudge connected={data.hasTelegramBound} />

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
              isLoading={data.isNeedsYouLoading}
              onApproved={data.refreshHomeSummary}
            />

            <ClearedOvernight
              agentName={data.agentName}
              totalCount={data.overnightClearedCount}
              topics={data.clearedTopics}
              timeSavedHours={data.timeSavedHours}
              repliesSent={data.repliesSent24h}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
