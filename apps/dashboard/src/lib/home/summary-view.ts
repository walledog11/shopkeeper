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
  }
}
