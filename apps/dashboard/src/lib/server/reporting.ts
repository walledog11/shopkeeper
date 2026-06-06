import { db } from "@clerk/db"
import { BadRequestError } from "@/lib/api/errors"

const MS_PER_DAY = 24 * 60 * 60 * 1000

export const ANALYTICS_TAG_LIMIT = 8
export const REPORTS_TAG_LIMIT = 6

const REPORTING_RANGE_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
} as const

type ReportingRangePreset = keyof typeof REPORTING_RANGE_DAYS

export interface ReportingDateRange {
  from: Date
  to: Date
}

export interface ReportingCount {
  count: number
}

export interface ReportingChannelCount extends ReportingCount {
  channel: string
}

export interface ReportingTagCount extends ReportingCount {
  tag: string
}

export interface FirstReplyStats {
  avgMinutes: number | null
  measuredCount: number
}

export interface ThreadReportingMetrics {
  total: number
  byStatus: Record<string, number>
  byChannel: ReportingChannelCount[]
  byTag: ReportingTagCount[]
  firstReply: FirstReplyStats
}

interface ParseReportingDateRangeOptions {
  allowRangePreset?: boolean
  defaultDays?: number
}

interface ThreadReportingMetricsOptions {
  tagLimit: number
}

function isRangePreset(value: string | null): value is ReportingRangePreset {
  return value != null && value in REPORTING_RANGE_DAYS
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * MS_PER_DAY)
}

function assertValidDateRange(range: ReportingDateRange): ReportingDateRange {
  if (Number.isNaN(range.from.getTime()) || Number.isNaN(range.to.getTime())) {
    throw new BadRequestError("Invalid date range")
  }
  if (range.from > range.to) {
    throw new BadRequestError("Invalid date range")
  }
  return range
}

function assertValidLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Reporting query limit must be a positive integer")
  }
}

export function parseReportingDateRange(
  searchParams: URLSearchParams,
  options: ParseReportingDateRangeOptions = {},
): ReportingDateRange {
  const defaultDays = options.defaultDays ?? 30
  const range = searchParams.get("range")
  const hasExplicitBounds = searchParams.has("from") || searchParams.has("to")

  if (options.allowRangePreset && range && !hasExplicitBounds && !isRangePreset(range)) {
    throw new BadRequestError("Invalid range")
  }

  const toValue = searchParams.get("to")
  const to = toValue ? new Date(toValue) : new Date()
  const fromValue = searchParams.get("from")

  const from = fromValue
    ? new Date(fromValue)
    : options.allowRangePreset && !hasExplicitBounds && isRangePreset(range)
      ? daysBefore(to, REPORTING_RANGE_DAYS[range])
      : daysBefore(to, defaultDays)

  return assertValidDateRange({ from, to })
}

export async function getThreadStatusCountsForRange(
  organizationId: string,
  range: ReportingDateRange,
): Promise<Record<string, number>> {
  const rows = await db.thread.groupBy({
    by: ["status"],
    where: {
      organizationId,
      deletedAt: null,
      createdAt: { gte: range.from, lte: range.to },
    },
    _count: { id: true },
  })

  return Object.fromEntries(rows.map(row => [row.status, row._count.id]))
}

export async function getThreadChannelCountsForRange(
  organizationId: string,
  range: ReportingDateRange,
): Promise<ReportingChannelCount[]> {
  const rows = await db.thread.groupBy({
    by: ["channelType"],
    where: {
      organizationId,
      deletedAt: null,
      createdAt: { gte: range.from, lte: range.to },
    },
    _count: { id: true },
  })

  return rows.map(row => ({ channel: row.channelType, count: row._count.id }))
}

export async function getThreadTagCountsForRange(
  organizationId: string,
  range: ReportingDateRange,
  options: { limit: number },
): Promise<ReportingTagCount[]> {
  assertValidLimit(options.limit)

  const rows = await db.thread.groupBy({
    by: ["tag"],
    where: {
      organizationId,
      deletedAt: null,
      createdAt: { gte: range.from, lte: range.to },
      tag: { not: null },
    },
    _count: { id: true },
    orderBy: [
      { _count: { id: "desc" } },
      { tag: "asc" },
    ],
    take: options.limit,
  })

  return rows.map(row => ({ tag: row.tag!, count: row._count.id }))
}

export async function getFirstReplyStatsForRange(
  organizationId: string,
  range: ReportingDateRange,
): Promise<FirstReplyStats> {
  const rows = await db.$queryRaw<{ avg_minutes: number | null; measured_count: bigint }[]>`
    WITH first_msgs AS (
      SELECT
        t.id,
        MIN(CASE WHEN m.sender_type = 'customer' THEN m.sent_at END) AS first_customer,
        MIN(CASE WHEN m.sender_type IN ('agent', 'ai') THEN m.sent_at END) AS first_response
      FROM threads t
      INNER JOIN messages m ON m.thread_id = t.id AND m.deleted_at IS NULL
      WHERE t.organization_id = ${organizationId}::uuid
        AND t.created_at >= ${range.from}
        AND t.created_at <= ${range.to}
        AND t.deleted_at IS NULL
      GROUP BY t.id
    )
    SELECT
      AVG(EXTRACT(EPOCH FROM (first_response - first_customer)) / 60)::float AS avg_minutes,
      COUNT(*)::bigint AS measured_count
    FROM first_msgs
    WHERE first_customer IS NOT NULL
      AND first_response IS NOT NULL
      AND first_response > first_customer
  `

  const firstReply = rows[0] ?? { avg_minutes: null, measured_count: BigInt(0) }
  return {
    avgMinutes: firstReply.avg_minutes != null ? Math.round(firstReply.avg_minutes) : null,
    measuredCount: Number(firstReply.measured_count),
  }
}

export async function getThreadReportingMetricsForRange(
  organizationId: string,
  range: ReportingDateRange,
  options: ThreadReportingMetricsOptions,
): Promise<ThreadReportingMetrics> {
  const [byStatus, byChannel, byTag, firstReply] = await Promise.all([
    getThreadStatusCountsForRange(organizationId, range),
    getThreadChannelCountsForRange(organizationId, range),
    getThreadTagCountsForRange(organizationId, range, { limit: options.tagLimit }),
    getFirstReplyStatsForRange(organizationId, range),
  ])

  return {
    total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
    byStatus,
    byChannel,
    byTag,
    firstReply,
  }
}
