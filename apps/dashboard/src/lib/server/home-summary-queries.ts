import { db, Prisma } from "@shopkeeper/db"
import type { ChannelType } from "@/types"
import {
  HOME_OVERNIGHT_TOPIC_LIMIT,
  HOME_REPEAT_CUSTOMER_LIMIT,
} from "@/lib/home/summary-contract"
import { canonicalInboxThreadSql } from "@/lib/messaging/inbox-filter"

const DAY_MS = 24 * 60 * 60 * 1000

export type MetricsRow = {
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

export type DailySeriesRow = {
  day: string
  new_threads: bigint
  ai_resolved: bigint
  total_replies: bigint
}

export type TopicRow = {
  tag: string
  count: bigint
}

export type ChannelRow = {
  channel_type: ChannelType
}

export type RepeatCustomerRow = {
  customer_id: string
  name: string | null
  platform_id: string
  ticket_count: bigint
}

export type ThreadIdRow = {
  id: string
}

type HomeSummaryWindows = {
  todayStart: Date
  yesterdayStart: Date
  weekStart: Date
  last24h: Date
  last30d: Date
}

export type HomeSummaryRows = {
  metricRows: MetricsRow[]
  dailyRows: DailySeriesRow[]
  topicRows: TopicRow[]
  channelRows: ChannelRow[]
  repeatRows: RepeatCustomerRow[]
}

function startOfUtcDay(date: Date): Date {
  const result = new Date(date)
  result.setUTCHours(0, 0, 0, 0)
  return result
}

export function getHomeSummaryWindows(now: Date): HomeSummaryWindows {
  const todayStart = startOfUtcDay(now)
  return {
    todayStart,
    yesterdayStart: new Date(todayStart.getTime() - DAY_MS),
    weekStart: new Date(todayStart.getTime() - 6 * DAY_MS),
    last24h: new Date(now.getTime() - DAY_MS),
    last30d: new Date(now.getTime() - 30 * DAY_MS),
  }
}

export function currentPlanPredicate(organizationId: string) {
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

export async function loadHomeSummaryRows(
  organizationId: string,
  now: Date,
  windows: HomeSummaryWindows,
): Promise<HomeSummaryRows> {
  const { todayStart, yesterdayStart, weekStart, last24h, last30d } = windows
  const [
    metricRows,
    dailyRows,
    topicRows,
    channelRows,
    repeatRows,
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
  ])

  return { metricRows, dailyRows, topicRows, channelRows, repeatRows }
}
