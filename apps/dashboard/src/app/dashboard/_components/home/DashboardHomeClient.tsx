"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import ResourcesCard from "./ResourcesCard"
import AgentBanner from "./AgentBanner"
import QuickActions from "./QuickActions"
import StatCards from "./StatCards"
import ViewsNav from "./ViewsNav"
import ChannelBreakdown from "./ChannelBreakdown"
import ActivityFeed from "./ActivityFeed"
import TicketList from "./TicketList"
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
    displayedThreads,
    channelBreakdown, activityEvents,
    workflowSteps, workflowDoneCount,
    navViews, channelConnected,
  } = useHomeData({ initialOpenThreads, initialClosedCount })

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col min-h-full px-5 md:px-6 pt-2 pb-4 gap-3">

          <AgentBanner />

          {/* Header */}
          <div className="flex items-start justify-between shrink-0 gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white/80">{greeting}, <span className="text-green-400">{userName}</span>.</h1>
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

          <QuickActions />

          <StatCards
            isLoading={isLoading}
            openCount={openCount}
            resolvedCount={resolvedCount}
            totalMessageCount={totalMessageCount}
          />

          {/* Main 3-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-3">

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
              <FeedbackSurvey />
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
