import type { HomeSummary } from "@/lib/home/summary-contract"

const MINUTES_SAVED_PER_AUTO_TICKET = 14

export function buildHomeSummaryView(summary: HomeSummary) {
  return {
    ...summary.metrics,
    needsYouItems: summary.needsAttention,
    clearedTopics: summary.overnight.topics,
    briefingChannels: summary.overnight.channelNames,
    repeatCustomers: summary.repeatCustomers,
    timeSavedHours: (summary.metrics.overnightClearedCount * MINUTES_SAVED_PER_AUTO_TICKET) / 60,
    newThreadsByDay: summary.series.newThreadsByDay,
    aiResolvedByDay: summary.series.aiResolvedByDay,
    totalRepliesByDay: summary.series.totalRepliesByDay,
    yourWeek: summary.series.days.map((day, index) => ({
      label: new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
      auto: summary.series.aiResolvedByDay[index],
      manual: Math.max(0, summary.series.totalRepliesByDay[index] - summary.series.aiResolvedByDay[index]),
    })),
  }
}
