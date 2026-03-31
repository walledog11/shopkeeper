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
import NeedsAttention from "./NeedsAttention"
import TicketList from "./TicketList"
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
    displayedThreads, needsAttention,
    channelBreakdown, activityEvents,
    workflowSteps, workflowDoneCount,
    navViews, channelConnected,
  } = useHomeData({ initialOpenThreads, initialClosedCount })

  return (
    <div className="h-full flex flex-col overflow-hidden bg-dashboard-bg">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col min-h-full px-5 md:px-6 py-4 gap-3">

          <AgentBanner />

          {/* Header */}
          <div className="flex items-start justify-between shrink-0 gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{greeting}, <span className="text-teal-700">{userName}</span>.</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                {isLoading
                  ? "Loading your queue…"
                  : openCount === 0
                    ? "You're all caught up. No open tickets."
                    : `You have ${openCount} open ticket${openCount !== 1 ? "s" : ""} waiting.`
                }
              </p>
            </div>
            <Link
              href="/dashboard/tickets"
              className="hidden md:flex items-center gap-1.5 text-sm font-semibold text-slate-800 bg-yellow-400 hover:bg-yellow-300 rounded-md px-3.5 py-2 transition-all shadow-sm shrink-0"
            >
              View all tickets <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <QuickActions />

          <StatCards
            isLoading={isLoading}
            openCount={openCount}
            resolvedCount={resolvedCount}
            totalMessageCount={totalMessageCount}
          />

          {/* Main 3-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-3 flex-1 min-h-0">

            {/* Left column */}
            <div className="flex flex-col gap-3 overflow-y-auto min-h-0">
              <ViewsNav navViews={navViews} activeView={activeView} setActiveView={setActiveView} />
              <ChannelBreakdown channelBreakdown={channelBreakdown} openCount={openCount} />
              <ActivityFeed activityEvents={activityEvents} />
              {!isLoading && <NeedsAttention needsAttention={needsAttention} openCount={openCount} />}
            </div>

            {/* Center column */}
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

            {/* Right column */}
            <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
              <WorkflowBasics workflowSteps={workflowSteps} workflowDoneCount={workflowDoneCount} />
              <div className="flex-1 min-h-0 overflow-hidden">
                <ResourcesCard />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
