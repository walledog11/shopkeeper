"use client"

import WorkflowSetupBanner from "./WorkflowSetupBanner"
import ConciergeBriefing from "./ConciergeBriefing"
import HomeDigest from "./HomeDigest"
import NeedsYou from "./NeedsYou"
import ClearedOvernight from "./ClearedOvernight"
import TodayShape from "./TodayShape"
import TodayOrders from "./TodayOrders"
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
        <div className="flex flex-col min-h-full px-5 md:px-6 pt-3 pb-6 gap-3">

          <WorkflowSetupBanner
            steps={data.workflowSteps}
            doneCount={data.workflowDoneCount}
          />

          <div className="grid grid-cols-1 @min-[1000px]:grid-cols-[1fr_280px] gap-4">
            <div className="flex flex-col gap-4 min-w-0">
              <ConciergeBriefing
                greeting={greeting}
                userName={userName}
                agentName={data.agentName}
                hasTelegramBound={data.hasTelegramBound}
                needsYouCount={data.needsYouCount}
                overnightClearedCount={data.overnightClearedCount}
                briefingChannels={data.briefingChannels}
              />

              <HomeDigest
                isLoading={data.isLoading}
                openCount={data.openCount}
                openDelta={data.openDelta}
                firstReplyMinutes={data.firstReplyMinutes}
                autoResolvedPct={data.autoResolvedPct}
                weeklyVolume={data.weeklyVolume}
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
                timeSavedHours={data.timeSavedHours}
                repliesSent={data.repliesSent24h}
              />
            </div>

            <div className="flex flex-col gap-4">
              <TodayShape
                ordersToShip={data.ordersToShip}
                refundsPending={data.refundsPending}
                vipsInQueue={data.vipsInQueue}
              />
              <TodayOrders orders={data.todaysOrders} hasShopify={data.hasShopify} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
