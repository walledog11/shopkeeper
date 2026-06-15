import type { OrgSettings } from "@/types"
import {
  lastUtcDayKeys,
  type HomeClearedTopic,
  type HomeRepeatCustomer,
  type HomeSummary,
} from "@/lib/home/summary-contract"
import { getChannelInfo } from "@/lib/messaging/channels"
import { getCustomerName } from "@/lib/messaging/customer-name"
import { loadNeedsAttention } from "@/lib/server/home-needs-attention"
import { getHomeSummaryWindows, loadHomeSummaryRows } from "@/lib/server/home-summary-queries"

const TAG_SUBTITLES: Record<string, string> = {
  Shipping: "WISMO replies sent",
  Returns: "size swaps + refunds",
  "Order Status": "tracking pulled & shared",
  "Product Inquiry": "answered from KB",
  General: "answered from KB",
}

function numberFromDb(value: bigint | number): number {
  return typeof value === "bigint" ? Number(value) : value
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .flatMap(part => part[0] ? [part[0]] : [])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?"
}

export async function getHomeSummary(
  organizationId: string,
  settings: Partial<OrgSettings> | null,
  now = new Date(),
): Promise<HomeSummary> {
  const windows = getHomeSummaryWindows(now)
  const [{ metricRows, dailyRows, topicRows, channelRows, repeatRows }, needsAttention] =
    await Promise.all([
      loadHomeSummaryRows(organizationId, now, windows),
      loadNeedsAttention(organizationId, settings, now),
    ])

  const metric = metricRows[0] ?? {
    open_count: BigInt(0),
    open_delta: BigInt(0),
    weekly_volume: BigInt(0),
    first_reply_minutes: null,
    auto_resolved_pct: null,
    replies_sent_24h: BigInt(0),
    overnight_cleared_count: BigInt(0),
    needs_you_count: BigInt(0),
    refunds_pending: BigInt(0),
    vips_in_queue: BigInt(0),
    has_sent_reply: false,
  }
  const byDay = new Map(dailyRows.map(row => [row.day, row]))
  const days = lastUtcDayKeys(now, 7)

  const topics: HomeClearedTopic[] = topicRows.map(row => ({
    tag: row.tag,
    count: numberFromDb(row.count),
    subtitle: TAG_SUBTITLES[row.tag] ?? "auto-resolved",
  }))

  const repeatCustomers: HomeRepeatCustomer[] = repeatRows.map((row) => {
    const name = getCustomerName({ name: row.name, platformId: row.platform_id })
    return {
      customerId: row.customer_id,
      name,
      initials: initialsOf(name),
      ticketCount: numberFromDb(row.ticket_count),
    }
  })

  return {
    generatedAt: now.toISOString(),
    metrics: {
      openCount: numberFromDb(metric.open_count),
      openDelta: numberFromDb(metric.open_delta),
      weeklyVolume: numberFromDb(metric.weekly_volume),
      firstReplyMinutes: metric.first_reply_minutes,
      autoResolvedPct: metric.auto_resolved_pct,
      repliesSent24h: numberFromDb(metric.replies_sent_24h),
      overnightClearedCount: numberFromDb(metric.overnight_cleared_count),
      needsYouCount: numberFromDb(metric.needs_you_count),
      refundsPending: numberFromDb(metric.refunds_pending),
      vipsInQueue: numberFromDb(metric.vips_in_queue),
      hasSentReply: metric.has_sent_reply,
    },
    series: {
      days,
      newThreadsByDay: days.map(day => numberFromDb(byDay.get(day)?.new_threads ?? 0)),
      aiResolvedByDay: days.map(day => numberFromDb(byDay.get(day)?.ai_resolved ?? 0)),
      totalRepliesByDay: days.map(day => numberFromDb(byDay.get(day)?.total_replies ?? 0)),
    },
    needsAttention,
    overnight: {
      topics,
      channelNames: channelRows.map(row => getChannelInfo(row.channel_type).name),
    },
    repeatCustomers,
  }
}
