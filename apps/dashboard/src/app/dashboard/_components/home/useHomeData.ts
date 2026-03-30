import { useState, useMemo } from "react"
import { useThreads } from "@/hooks/useThreads"
import { getCustomerName } from "@/lib/utils"
import { getChannelInfo } from "@/lib/channels"
import type { Thread } from "@/types"
import type { ViewId, NavView } from "./types"
import type { ActivityEvent } from "./ActivityFeed"

function sortByDate(threads: Thread[]): Thread[] {
  return [...threads].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

interface Options {
  initialOpenThreads: Thread[]
  initialClosedCount: number
}

export function useHomeData({ initialOpenThreads, initialClosedCount }: Options) {
  const [activeView, setActiveView] = useState<ViewId>('all')

  const { threads: openThreads, isLoading: loadingOpen } = useThreads('open', initialOpenThreads, true, true)
  const fetchClosed = activeView === 'resolved'
  const { threads: closedThreads, isLoading: loadingClosed } = useThreads('closed', undefined, fetchClosed, true)

  const isLoading = loadingOpen || (fetchClosed && loadingClosed)
  const openCount = openThreads.length
  const resolvedCount = fetchClosed && closedThreads.length > 0 ? closedThreads.length : initialClosedCount

  const allThreads = useMemo(() => [...openThreads, ...closedThreads], [openThreads, closedThreads])

  const recentThreads = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    return allThreads.filter(t => new Date(t.updatedAt).getTime() > cutoff)
  }, [allThreads])

  const viewThreads = useMemo<Record<ViewId, Thread[]>>(() => ({
    all: sortByDate(allThreads),
    open: sortByDate(openThreads),
    resolved: sortByDate(closedThreads),
    recent: sortByDate(recentThreads),
  }), [allThreads, openThreads, closedThreads, recentThreads])

  const displayedThreads = viewThreads[activeView]

  const needsAttention = useMemo(() => sortByDate(openThreads).slice(0, 4), [openThreads])

  const channelBreakdown = useMemo(() => {
    const counts: Record<string, { name: string; logo: string; count: number }> = {}
    openThreads.forEach(t => {
      const info = getChannelInfo(t.channelType)
      if (!counts[t.channelType]) counts[t.channelType] = { ...info, count: 0 }
      counts[t.channelType].count++
    })
    return Object.values(counts).sort((a, b) => b.count - a.count)
  }, [openThreads])

  const activityEvents = useMemo<ActivityEvent[]>(() => {
    const events: ActivityEvent[] = []
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

    openThreads.forEach(thread => {
      const customer = getCustomerName(thread.customer)
      const channel = getChannelInfo(thread.channelType)
      const createdAt = new Date(thread.createdAt).getTime()
      if (createdAt > sevenDaysAgo) {
        events.push({ id: thread.id + '_new', type: 'new_ticket', customer, channel, time: thread.createdAt })
      }
      if (thread.messages[0]) {
        events.push({ id: thread.id + '_msg', type: 'message', customer, channel, time: thread.messages[0].sentAt })
      }
    })
    closedThreads.forEach(thread => {
      events.push({
        id: thread.id + '_resolved',
        type: 'resolved',
        customer: getCustomerName(thread.customer),
        channel: getChannelInfo(thread.channelType),
        time: thread.updatedAt,
      })
    })
    return events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 12)
  }, [openThreads, closedThreads])

  const channelConnected = openCount > 0 || resolvedCount > 0
  const workflowSteps = useMemo(() => [
    { label: "Connect a channel", href: "/dashboard/integrations", status: (channelConnected ? "done" : "pending") as "done" | "pending" },
    { label: "Invite team members", href: "/dashboard/team", status: "pending" as const },
    { label: "Configure AI agent", href: "/dashboard/settings", status: "pending" as const },
    { label: "Add more channels", href: "/dashboard/integrations", status: "pending" as const },
  ], [channelConnected])
  const workflowDoneCount = workflowSteps.filter(s => s.status === "done").length

  const navViews = useMemo<NavView[]>(() => [
    { id: 'all', label: 'All tickets', count: openCount + resolvedCount },
    { id: 'open', label: 'Open', count: openCount },
    { id: 'resolved', label: 'Resolved', count: resolvedCount },
    { id: 'recent', label: 'Recent (24h)', count: recentThreads.length },
  ], [openCount, resolvedCount, recentThreads.length])

  return {
    activeView,
    setActiveView,
    isLoading,
    openCount,
    resolvedCount,
    displayedThreads,
    needsAttention,
    channelBreakdown,
    activityEvents,
    workflowSteps,
    workflowDoneCount,
    navViews,
  }
}
