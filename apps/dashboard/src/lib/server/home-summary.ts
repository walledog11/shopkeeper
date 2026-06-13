import { db, Prisma, SenderType } from "@shopkeeper/db"
import type { ChannelType, OrgSettings } from "@/types"
import { getCurrentPlanForThread } from "@shopkeeper/agent/plan-cache-shape"
import { buildPlanPreview, classifyHomePlan, planReplyText } from "@shopkeeper/agent/plan-preview"
import {
  HOME_NEEDS_ATTENTION_LIMIT,
  HOME_OVERNIGHT_TOPIC_LIMIT,
  HOME_REPEAT_CUSTOMER_LIMIT,
  lastUtcDayKeys,
  type HomeClearedTopic,
  type HomeNeedsAttentionItem,
  type HomeRepeatCustomer,
  type HomeSummary,
} from "@/lib/home/summary-contract"
import { canonicalInboxThreadSql, canonicalInboxThreadWhere } from "@/lib/messaging/inbox-filter"
import { getChannelInfo } from "@/lib/messaging/channels"
import { getCustomerName } from "@/lib/messaging/customer-name"

const DAY_MS = 24 * 60 * 60 * 1000

const TAG_SUBTITLES: Record<string, string> = {
  Shipping: "WISMO replies sent",
  Returns: "size swaps + refunds",
  "Order Status": "tracking pulled & shared",
  "Product Inquiry": "answered from KB",
  General: "answered from KB",
}

type MetricsRow = {
  open_count: bigint
  open_delta: bigint
  weekly_volume: bigint
  first_reply_minutes: number | null
  auto_resolved_pct: number | null
  replies_sent_24h: bigint
  overnight_cleared_count: bigint
  needs_you_count: bigint
  refunds_pending: bigint
  vips_in_queue: bigint
  has_sent_reply: boolean
}

type DailySeriesRow = {
  day: string
  new_threads: bigint
  ai_resolved: bigint
  total_replies: bigint
}

type TopicRow = {
  tag: string
  count: bigint
}

type ChannelRow = {
  channel_type: ChannelType
}

type RepeatCustomerRow = {
  customer_id: string
  name: string | null
  platform_id: string
  ticket_count: bigint
}

type ThreadIdRow = {
  id: string
}

function startOfUtcDay(date: Date): Date {
  const result = new Date(date)
  result.setUTCHours(0, 0, 0, 0)
  return result
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

function timeAgoShort(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function currentPlanPredicate(organizationId: string) {
  return Prisma.sql`
    t.status = 'open'
    AND t.cached_plan IS NOT NULL
    AND t.cached_plan_message_id IS NOT NULL
    AND t.cached_plan->>'version' = '2'
    AND CASE
      WHEN jsonb_typeof(t.cached_plan #> '{plan,steps}') = 'array'
      THEN jsonb_array_length(t.cached_plan #> '{plan,steps}') > 0
      ELSE FALSE
    END
    AND t.cached_plan_message_id = (
      SELECT m.id
      FROM messages m
      WHERE m.thread_id = t.id
        AND m.deleted_at IS NULL
        AND m.sender_type <> 'note'
      ORDER BY m.sent_at DESC, m.id DESC
      LIMIT 1
    )
    AND EXISTS (
      SELECT 1
      FROM messages cached_message
      WHERE cached_message.id = t.cached_plan_message_id
        AND cached_message.thread_id = t.id
        AND cached_message.deleted_at IS NULL
        AND cached_message.sender_type = 'customer'
    )
    AND ${canonicalInboxThreadSql(organizationId)}
  `
}

async function loadNeedsAttention(
  organizationId: string,
  settings: Partial<OrgSettings> | null,
  now: Date,
): Promise<HomeNeedsAttentionItem[]> {
  const rows = await db.$queryRaw<ThreadIdRow[]>`
    SELECT t.id
    FROM threads t
    WHERE ${currentPlanPredicate(organizationId)}
    ORDER BY t.last_message_at DESC, t.id DESC
    LIMIT ${HOME_NEEDS_ATTENTION_LIMIT}
  `

  if (rows.length === 0) return []

  const ids = rows.map(row => row.id)
  const threads = await db.thread.findMany({
    where: {
      ...canonicalInboxThreadWhere(organizationId),
      id: { in: ids },
      status: "open",
    },
    include: {
      customer: true,
      messages: {
        where: { senderType: { not: SenderType.note }, deletedAt: null },
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
        take: 1,
      },
    },
  })
  const byId = new Map(threads.map(thread => [thread.id, thread]))

  return ids.flatMap((id) => {
    const thread = byId.get(id)
    const latestMessage = thread?.messages[0]
    if (!thread || !latestMessage) return []

    const plan = getCurrentPlanForThread(thread, latestMessage.id)
    if (!plan) return []

    const copy = buildPlanPreview(plan, thread.aiSummary, latestMessage.contentText)
    const classification = classifyHomePlan(plan, settings)
    const kind: HomeNeedsAttentionItem["kind"] =
      classification.kind === "quick_reply" ? "quick_reply" : "needs_review"

    return [{
      threadId: thread.id,
      kind,
      customerName: getCustomerName(thread.customer),
      channelName: getChannelInfo(thread.channelType as ChannelType).name,
      timeAgo: timeAgoShort(latestMessage.sentAt, now),
      headline: copy.headline,
      contextLine: copy.context,
      proposalSummary: copy.proposal,
      actionText: copy.actionText,
      replyText: planReplyText(plan),
      orderRef: copy.orderRef,
      tag: thread.tag,
    }]
  })
}

export async function getHomeSummary(
  organizationId: string,
  settings: Partial<OrgSettings> | null,
  now = new Date(),
): Promise<HomeSummary> {
  const todayStart = startOfUtcDay(now)
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS)
  const weekStart = new Date(todayStart.getTime() - 6 * DAY_MS)
  const last24h = new Date(now.getTime() - DAY_MS)
  const last30d = new Date(now.getTime() - 30 * DAY_MS)

  const [
    metricRows,
    dailyRows,
    topicRows,
    channelRows,
    repeatRows,
    needsAttention,
  ] = await Promise.all([
    db.$queryRaw<MetricsRow[]>`
      WITH inbox_threads AS MATERIALIZED (
        SELECT t.*
        FROM threads t
        WHERE ${canonicalInboxThreadSql(organizationId)}
          AND t.status IN ('open', 'closed')
      ),
      customer_thread_counts AS (
        SELECT customer_id, COUNT(*) AS thread_count
        FROM inbox_threads
        GROUP BY customer_id
      ),
      reply_counts AS (
        SELECT
          COUNT(*) FILTER (WHERE m.sender_type = 'ai') AS ai_replies,
          COUNT(*) FILTER (WHERE m.sender_type = 'agent') AS agent_replies
        FROM messages m
        INNER JOIN inbox_threads t ON t.id = m.thread_id
        WHERE m.deleted_at IS NULL
          AND m.sent_at >= ${weekStart}
          AND m.sent_at <= ${now}
      ),
      first_replies AS (
        SELECT
          t.id,
          MIN(m.sent_at) FILTER (WHERE m.sender_type = 'customer') AS first_customer,
          MIN(m.sent_at) FILTER (WHERE m.sender_type IN ('agent', 'ai')) AS first_response
        FROM inbox_threads t
        INNER JOIN messages m ON m.thread_id = t.id AND m.deleted_at IS NULL
        WHERE t.created_at >= ${weekStart}
          AND t.created_at <= ${now}
        GROUP BY t.id
      )
      SELECT
        COUNT(*) FILTER (WHERE t.status = 'open')::bigint AS open_count,
        (
          COUNT(*) FILTER (WHERE t.created_at >= ${todayStart} AND t.created_at <= ${now})
          - COUNT(*) FILTER (WHERE t.created_at >= ${yesterdayStart} AND t.created_at < ${todayStart})
        )::bigint AS open_delta,
        COUNT(*) FILTER (WHERE t.created_at >= ${weekStart} AND t.created_at <= ${now})::bigint AS weekly_volume,
        (
          SELECT ROUND(AVG(EXTRACT(EPOCH FROM (first_response - first_customer)) / 60))::int
          FROM first_replies
          WHERE first_customer IS NOT NULL
            AND first_response IS NOT NULL
            AND first_response > first_customer
        ) AS first_reply_minutes,
        (
          SELECT CASE
            WHEN ai_replies + agent_replies > 0
            THEN ROUND((ai_replies * 100.0) / (ai_replies + agent_replies))::int
            ELSE NULL
          END
          FROM reply_counts
        ) AS auto_resolved_pct,
        (
          SELECT COUNT(*)::bigint
          FROM messages m
          INNER JOIN inbox_threads reply_thread ON reply_thread.id = m.thread_id
          WHERE m.deleted_at IS NULL
            AND m.sender_type IN ('agent', 'ai')
            AND m.sent_at >= ${last24h}
            AND m.sent_at <= ${now}
        ) AS replies_sent_24h,
        COUNT(*) FILTER (
          WHERE t.status = 'closed'
            AND t.last_message_sender_type = 'ai'
            AND t.updated_at >= ${last24h}
            AND t.updated_at <= ${now}
        )::bigint AS overnight_cleared_count,
        (
          SELECT COUNT(*)::bigint
          FROM threads t
          WHERE ${currentPlanPredicate(organizationId)}
        ) AS needs_you_count,
        COUNT(*) FILTER (WHERE t.status = 'open' AND t.tag = 'Returns')::bigint AS refunds_pending,
        (
          SELECT COUNT(*)::bigint
          FROM inbox_threads vip_thread
          INNER JOIN customer_thread_counts customer_count
            ON customer_count.customer_id = vip_thread.customer_id
          WHERE vip_thread.status = 'open'
            AND customer_count.thread_count >= 3
        ) AS vips_in_queue,
        EXISTS (
          SELECT 1
          FROM messages m
          INNER JOIN inbox_threads sent_thread ON sent_thread.id = m.thread_id
          WHERE m.deleted_at IS NULL
            AND m.sender_type IN ('agent', 'ai')
        ) AS has_sent_reply
      FROM inbox_threads t
    `,

    db.$queryRaw<DailySeriesRow[]>`
      WITH inbox_threads AS MATERIALIZED (
        SELECT t.*
        FROM threads t
        WHERE ${canonicalInboxThreadSql(organizationId)}
          AND t.status IN ('open', 'closed')
      ),
      days AS (
        SELECT generate_series(
          date_trunc('day', ${weekStart}::timestamptz AT TIME ZONE 'UTC'),
          date_trunc('day', ${todayStart}::timestamptz AT TIME ZONE 'UTC'),
          interval '1 day'
        ) AS day
      ),
      new_threads AS (
        SELECT date_trunc('day', t.created_at AT TIME ZONE 'UTC') AS day, COUNT(*)::bigint AS count
        FROM inbox_threads t
        WHERE t.created_at >= ${weekStart}
          AND t.created_at <= ${now}
        GROUP BY date_trunc('day', t.created_at AT TIME ZONE 'UTC')
      ),
      ai_resolved AS (
        SELECT date_trunc('day', t.updated_at AT TIME ZONE 'UTC') AS day, COUNT(*)::bigint AS count
        FROM inbox_threads t
        WHERE t.status = 'closed'
          AND t.last_message_sender_type = 'ai'
          AND t.updated_at >= ${weekStart}
          AND t.updated_at <= ${now}
        GROUP BY date_trunc('day', t.updated_at AT TIME ZONE 'UTC')
      ),
      replies AS (
        SELECT date_trunc('day', m.sent_at AT TIME ZONE 'UTC') AS day, COUNT(*)::bigint AS count
        FROM messages m
        INNER JOIN inbox_threads t ON t.id = m.thread_id
        WHERE m.deleted_at IS NULL
          AND m.sender_type IN ('agent', 'ai')
          AND m.sent_at >= ${weekStart}
          AND m.sent_at <= ${now}
        GROUP BY date_trunc('day', m.sent_at AT TIME ZONE 'UTC')
      )
      SELECT
        to_char(days.day, 'YYYY-MM-DD') AS day,
        COALESCE(new_threads.count, 0)::bigint AS new_threads,
        COALESCE(ai_resolved.count, 0)::bigint AS ai_resolved,
        COALESCE(replies.count, 0)::bigint AS total_replies
      FROM days
      LEFT JOIN new_threads ON new_threads.day = days.day
      LEFT JOIN ai_resolved ON ai_resolved.day = days.day
      LEFT JOIN replies ON replies.day = days.day
      ORDER BY days.day ASC
    `,

    db.$queryRaw<TopicRow[]>`
      SELECT COALESCE(t.tag, 'General') AS tag, COUNT(*)::bigint AS count
      FROM threads t
      WHERE ${canonicalInboxThreadSql(organizationId)}
        AND t.status = 'closed'
        AND t.last_message_sender_type = 'ai'
        AND t.updated_at >= ${last24h}
        AND t.updated_at <= ${now}
      GROUP BY COALESCE(t.tag, 'General')
      ORDER BY count DESC, tag ASC
      LIMIT ${HOME_OVERNIGHT_TOPIC_LIMIT}
    `,

    db.$queryRaw<ChannelRow[]>`
      SELECT t.channel_type::text AS channel_type
      FROM threads t
      WHERE ${canonicalInboxThreadSql(organizationId)}
        AND t.status = 'closed'
        AND t.last_message_sender_type = 'ai'
        AND t.updated_at >= ${last24h}
        AND t.updated_at <= ${now}
      GROUP BY t.channel_type
      ORDER BY COUNT(*) DESC, t.channel_type ASC
      LIMIT 5
    `,

    db.$queryRaw<RepeatCustomerRow[]>`
      SELECT
        c.id AS customer_id,
        c.name,
        c.platform_id,
        COUNT(t.id)::bigint AS ticket_count
      FROM threads t
      INNER JOIN customers c ON c.id = t.customer_id
      WHERE ${canonicalInboxThreadSql(organizationId)}
        AND t.status IN ('open', 'closed')
        AND t.updated_at >= ${last30d}
        AND t.updated_at <= ${now}
      GROUP BY c.id, c.name, c.platform_id
      HAVING COUNT(t.id) >= 3
      ORDER BY ticket_count DESC, MAX(t.updated_at) DESC, c.id ASC
      LIMIT ${HOME_REPEAT_CUSTOMER_LIMIT}
    `,

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
