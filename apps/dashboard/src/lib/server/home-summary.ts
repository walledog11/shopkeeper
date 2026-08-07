import type { OrgSettings } from "@/types"
import { db } from "@shopkeeper/db"
import { listRecentUnfulfilledOrderIds } from "@shopkeeper/agent/shopify"
import {
  lastUtcDayKeys,
  type HomeChannelState,
  type HomeClearedTopic,
  type HomeRepeatCustomer,
  type HomeSummary,
} from "@/lib/home/summary-contract"
import { isEmailIntegrationConfigured } from "@/lib/integrations/onboarding-setup"
import { getChannelInfo } from "@/lib/messaging/channels"
import { getCustomerName } from "@/lib/messaging/customer-name"
import { loadNeedsAttention } from "@/lib/server/home-needs-attention"
import { getHomeSummaryWindows, loadHomeSummaryRows } from "@/lib/server/home-summary-queries"
import { isShopifyIntegrationOperational } from "@/lib/server/shopify-integration"

const ORDERS_TO_SHIP_LIMIT = 10

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

async function loadOrdersToShip(organizationId: string): Promise<number | null> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: "shopify", accessToken: { not: null } },
    orderBy: { createdAt: "desc" },
    select: {
      accessToken: true,
      tokenExpiresAt: true,
      externalAccountId: true,
    },
  })

  if (!integration || !isShopifyIntegrationOperational(integration)) {
    return null
  }

  const shop = integration.externalAccountId
  const accessToken = integration.accessToken
  if (!shop || !accessToken) return null

  try {
    const orderIds = await listRecentUnfulfilledOrderIds(
      { shop, accessToken },
      ORDERS_TO_SHIP_LIMIT,
    )
    return orderIds.length
  } catch {
    return null
  }
}

// The setup banner and the channel nudge key off these four booleans. The client
// keeps them fresh through SWR, but with no server answer they all start false,
// so both elements mount on first paint and unmount once the fetches land —
// shifting everything below them. Render from this instead and they settle once.
export async function getHomeChannelState(
  organizationId: string,
  clerkUserId: string | null,
): Promise<HomeChannelState> {
  const [integrations, member] = await Promise.all([
    db.integration.findMany({
      where: { organizationId },
      select: {
        platform: true,
        accessToken: true,
        tokenExpiresAt: true,
        fromEmail: true,
        externalAccountId: true,
        metadata: true,
      },
    }),
    clerkUserId
      ? db.orgMember.findUnique({
          where: { organizationId_clerkUserId: { organizationId, clerkUserId } },
          select: {
            _count: { select: { telegramChats: true, imessageBindings: true } },
          },
        })
      : null,
  ])

  const shopify = integrations.find(integration => integration.platform === "shopify")

  return {
    hasShopify: shopify ? isShopifyIntegrationOperational(shopify) : false,
    hasEmailForwarding: isEmailIntegrationConfigured(
      integrations.find(integration => integration.platform === "email"),
    ),
    hasInstagram: integrations.some(integration => integration.platform === "ig_dm"),
    hasPhoneBound: (member?._count.telegramChats ?? 0) + (member?._count.imessageBindings ?? 0) > 0,
  }
}

export async function getHomeSummary(
  organizationId: string,
  settings: Partial<OrgSettings> | null,
  now = new Date(),
): Promise<HomeSummary> {
  const windows = getHomeSummaryWindows(now)
  const [
    { metricRows, dailyRows, topicRows, channelRows, repeatRows },
    needsAttention,
    ordersToShip,
  ] = await Promise.all([
    loadHomeSummaryRows(organizationId, now, windows),
    loadNeedsAttention(organizationId, settings, now),
    loadOrdersToShip(organizationId),
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
    ordersToShip,
  }
}
