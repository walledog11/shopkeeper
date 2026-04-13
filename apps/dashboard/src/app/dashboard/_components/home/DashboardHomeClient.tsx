"use client"

import ResourcesCard from "./ResourcesCard"
import AgentBanner from "./AgentBanner"
import StatCards from "./StatCards"
import ViewsNav from "./ViewsNav"
import ChannelBreakdown from "./ChannelBreakdown"
import ActivityFeed from "./ActivityFeed"
import TicketList from "./TicketList"
import InsightsCard from "./InsightsCard"
import FeedbackSurvey from "./FeedbackSurvey"
import WorkflowBasics from "./WorkflowBasics"
import { useHomeData } from "./useHomeData"
import type { Thread } from "@/types"

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

interface Props {
  userName: string
  initialOpenThreads: Thread[]
  initialClosedCount: number
  totalMessageCount: number
}

export default function DashboardHomeClient({ userName, initialOpenThreads, initialClosedCount, totalMessageCount }: Props) {
  const greeting = getGreeting()
  const {
    activeView, setActiveView,
    isLoading, openCount, resolvedCount,
    resolvedTodayCount, avgResponseMinutes,
    openThreads, closedThreads,
    displayedThreads,
    channelBreakdown, activityEvents,
    workflowSteps, workflowDoneCount,
    navViews, channelConnected,
  } = useHomeData({ initialOpenThreads, initialClosedCount })

  return (
    <div className="@container h-full flex flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col min-h-full px-5 md:px-6 pt-2 pb-4 gap-3">

          <AgentBanner />

          {/* Header */}
          <div className="flex items-start justify-between shrink-0 gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">{greeting}, <span className="text-white">{userName}</span>.</h1>
              <p className="text-sm text-white/35 mt-0.5">
                {isLoading
                  ? "Loading your queue…"
                  : openCount === 0
                    ? "You're all caught up. No open tickets."
                    : `You have ${openCount} open ticket${openCount !== 1 ? "s" : ""} waiting.`
                }
              </p>
            </div>
          </div>

          <StatCards
            isLoading={isLoading}
            openCount={openCount}
            resolvedTodayCount={resolvedTodayCount}
            avgResponseMinutes={avgResponseMinutes}
            totalMessageCount={totalMessageCount}
          />

          <div className="border-t border-white/[0.04]" />

          {/* Main 3-column layout */}
          <div className="grid grid-cols-1 @min-[800px]:grid-cols-[220px_1fr_260px] gap-3">

            {/* Left column */}
            <div className="flex flex-col gap-3 [&>*:last-child]:flex-1">
              <ViewsNav navViews={navViews} activeView={activeView} setActiveView={setActiveView} />
              <ChannelBreakdown channelBreakdown={channelBreakdown} openCount={openCount} />
              <ActivityFeed activityEvents={activityEvents} />
            </div>

            {/* Center column */}
            <div className="flex flex-col gap-3 min-w-0">
              <TicketList
                isLoading={isLoading}
                displayedThreads={displayedThreads}
                activeView={activeView}
                navViews={navViews}
                openCount={openCount}
                resolvedCount={resolvedCount}
                setActiveView={setActiveView}
                hasChannel={channelConnected}
              />
              <InsightsCard openThreads={openThreads} closedThreads={closedThreads} />
              <div className="flex-1 min-h-0">
                <FeedbackSurvey />
              </div>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-3 [&>*:last-child]:flex-1">
              <WorkflowBasics workflowSteps={workflowSteps} workflowDoneCount={workflowDoneCount} />
              <ResourcesCard />
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
