"use client"

import { useMemo } from "react"
import WorkflowSetupBanner from "./WorkflowSetupBanner"
import HomeChannelNudge from "./HomeChannelNudge"
import ConciergeBriefing from "./ConciergeBriefing"
import NeedsYou from "./NeedsYou"
import ClearedOvernight from "./ClearedOvernight"
import { HomePageSkeleton } from "@/app/dashboard/_components/skeletons"
import type { HomeChannelState, HomeSummary } from "@/lib/home/summary-contract"
import { useHomeData } from "./useHomeData"
import { SAMPLE_NEEDS_YOU_ITEMS } from "./sample-needs-you-items"

interface Props {
  userName: string
  agentName: string
  greeting: string
  initialHomeSummary: HomeSummary
  initialChannelState: HomeChannelState
  workflowBannerDismissed: boolean
  workflowBannerExpanded: boolean
  instagramAvailable: boolean
}

export default function DashboardHomeClient({
  userName,
  agentName,
  greeting,
  initialHomeSummary,
  initialChannelState,
  workflowBannerDismissed,
  workflowBannerExpanded,
  instagramAvailable,
}: Props) {
  const data = useHomeData(initialHomeSummary, agentName, initialChannelState)
  const needsYouItems = useMemo(() => {
    if (data.needsYouItems.length > 0) return data.needsYouItems
    if (process.env.NODE_ENV === "development") return SAMPLE_NEEDS_YOU_ITEMS
    return data.needsYouItems
  }, [data.needsYouItems])

  if (data.isSummaryPending) {
    return <HomePageSkeleton />
  }

  return (
    <div className="@container h-full flex flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col min-h-full w-full max-w-2xl mx-auto px-5 md:px-6 lg:px-8 pt-3 pb-4 gap-3">

          <WorkflowSetupBanner
            steps={data.workflowSteps}
            initialDismissed={workflowBannerDismissed}
            initialExpanded={workflowBannerExpanded}
          />

          <HomeChannelNudge
            hasPhoneBound={data.hasPhoneBound}
            hasEmail={data.hasEmailForwarding}
            hasInstagram={data.hasInstagram}
            instagramAvailable={instagramAvailable}
          />

          <div className="flex flex-col gap-3 min-w-0">
            <ConciergeBriefing
              greeting={greeting}
              userName={userName}
              agentName={data.agentName}
              walkthroughItems={data.walkthroughItems}
              walkthroughCount={data.walkthroughCount}
              needsYouCount={needsYouItems.length}
              overnightClearedCount={data.overnightClearedCount}
              briefingChannels={data.briefingChannels}
              refundsPending={data.refundsPending}
              vipsInQueue={data.vipsInQueue}
              ordersToShip={data.ordersToShip}
            />

            <NeedsYou
              items={needsYouItems}
              agentName={data.agentName}
              onApproved={data.refreshHomeSummary}
            />

            <ClearedOvernight
              agentName={data.agentName}
              totalCount={data.overnightClearedCount}
              topics={data.clearedTopics}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
