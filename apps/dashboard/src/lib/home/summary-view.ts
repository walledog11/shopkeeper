import type { HomeSummary } from "@/lib/home/summary-contract"

export function buildHomeSummaryView(summary: HomeSummary) {
  return {
    ...summary.metrics,
    needsYouItems: summary.needsAttention,
    clearedTopics: summary.overnight.topics,
    briefingChannels: summary.overnight.channelNames,
    repeatCustomers: summary.repeatCustomers,
  }
}
