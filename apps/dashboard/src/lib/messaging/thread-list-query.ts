import { Prisma, db as defaultDb } from "@shopkeeper/db"
import { SUPPORTED_AGENT_PLAN_CACHE_VERSIONS } from "@shopkeeper/agent/plan-cache-shape"
import { canonicalInboxThreadSql } from "@/lib/messaging/inbox-filter"

// Thread lists sort by (last_message_at DESC, id DESC), so the page cursor must
// carry both components — paging by id alone skips or repeats rows whenever UUID
// order disagrees with last_message_at order. The cursor is opaque to clients,
// which round-trip it unchanged. `lastMessageAt` is an ISO-8601 UTC string
// (microsecond precision from the SQL path, millisecond from the Prisma path).
export type ThreadCursor = { lastMessageAt: string; id: string }

export function encodeThreadCursor(lastMessageAt: string, id: string): string {
  return Buffer.from(`${lastMessageAt}|${id}`, "utf8").toString("base64url")
}

export function decodeThreadCursor(raw: string): ThreadCursor | null {
  let decoded: string
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8")
  } catch {
    return null
  }
  const sep = decoded.indexOf("|")
  if (sep <= 0) return null
  const lastMessageAt = decoded.slice(0, sep)
  const id = decoded.slice(sep + 1)
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  if (Number.isNaN(Date.parse(lastMessageAt))) return null
  return { lastMessageAt, id }
}

export function draftReadyPlanSql(organizationId: string) {
  return Prisma.sql`
    t.status = 'open'
    AND t.cached_plan IS NOT NULL
    AND t.cached_plan_message_id IS NOT NULL
    AND t.cached_plan->>'version' IN (${Prisma.join(SUPPORTED_AGENT_PLAN_CACHE_VERSIONS.map(String))})
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

export function forMeThreadSql(organizationId: string) {
  return Prisma.sql`
    t.status = 'open'
    AND ${canonicalInboxThreadSql(organizationId)}
    AND (
      t.last_message_sender_type = 'customer'
      OR (
        t.cached_plan IS NOT NULL
        AND t.cached_plan_message_id IS NOT NULL
        AND t.cached_plan->>'version' IN (${Prisma.join(SUPPORTED_AGENT_PLAN_CACHE_VERSIONS.map(String))})
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
      )
    )
  `
}

export type ThreadListSqlFilters = {
  forMe?: boolean
  hasDraft?: boolean
  needsReply?: boolean
  tag?: string
  channelType?: string
  wantsFiltered?: boolean
  status?: "open" | "closed"
}

function inboxScopeSql(organizationId: string, filters: ThreadListSqlFilters) {
  if (filters.forMe) {
    if (filters.tag && filters.channelType) {
      return Prisma.sql`${forMeThreadSql(organizationId)} AND t.tag = ${filters.tag} AND t.channel_type = ${filters.channelType}`
    }
    if (filters.tag) {
      return Prisma.sql`${forMeThreadSql(organizationId)} AND t.tag = ${filters.tag}`
    }
    if (filters.channelType) {
      return Prisma.sql`${forMeThreadSql(organizationId)} AND t.channel_type = ${filters.channelType}`
    }
    return forMeThreadSql(organizationId)
  }

  if (filters.wantsFiltered) {
    return Prisma.sql`
      t.deleted_at IS NULL
      AND t.archived_at IS NULL
      AND t.organization_id = ${organizationId}::uuid
      AND t.channel_type NOT IN ('sms_agent', 'dashboard_agent')
      AND t.filter_status = 'filtered'
    `
  }

  if (filters.hasDraft) {
    if (filters.tag && filters.channelType) {
      return Prisma.sql`${draftReadyPlanSql(organizationId)} AND t.tag = ${filters.tag} AND t.channel_type = ${filters.channelType}`
    }
    if (filters.tag) {
      return Prisma.sql`${draftReadyPlanSql(organizationId)} AND t.tag = ${filters.tag}`
    }
    if (filters.channelType) {
      return Prisma.sql`${draftReadyPlanSql(organizationId)} AND t.channel_type = ${filters.channelType}`
    }
    return draftReadyPlanSql(organizationId)
  }

  return Prisma.sql`
    t.deleted_at IS NULL
    AND t.archived_at IS NULL
    AND t.organization_id = ${organizationId}::uuid
    AND t.channel_type NOT IN ('sms_agent', 'dashboard_agent')
    AND t.filter_status <> 'filtered'
    ${filters.status === "open"
      ? Prisma.sql`AND t.status = 'open'`
      : filters.status === "closed"
        ? Prisma.sql`AND t.status = 'closed'`
        : Prisma.empty}
    ${filters.needsReply ? Prisma.sql`AND t.last_message_sender_type = 'customer'` : Prisma.empty}
    ${filters.tag ? Prisma.sql`AND t.tag = ${filters.tag}` : Prisma.empty}
    ${filters.channelType ? Prisma.sql`AND t.channel_type = ${filters.channelType}` : Prisma.empty}
  `
}

export async function countThreadsBySqlFilters(
  organizationId: string,
  filters: ThreadListSqlFilters,
  db: Pick<typeof defaultDb, "$queryRaw"> = defaultDb,
) {
  const where = inboxScopeSql(organizationId, filters)
  const rows = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM threads t
    WHERE ${where}
  `
  return Number(rows[0]?.count ?? 0)
}

export async function listThreadIdsBySqlFilters(
  organizationId: string,
  filters: ThreadListSqlFilters,
  options?: { cursor?: ThreadCursor; limit?: number },
  db: Pick<typeof defaultDb, "$queryRaw"> = defaultDb,
) {
  const where = inboxScopeSql(organizationId, filters)
  const limit = options?.limit
  const cursor = options?.cursor

  const rows = await db.$queryRaw<{ id: string; lmat: string }[]>`
    SELECT
      t.id,
      to_char(t.last_message_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS lmat
    FROM threads t
    WHERE ${where}
    ${cursor
      ? Prisma.sql`AND (t.last_message_at, t.id) < (${cursor.lastMessageAt}::timestamptz, ${cursor.id}::uuid)`
      : Prisma.empty}
    ORDER BY t.last_message_at DESC, t.id DESC
    ${limit !== undefined ? Prisma.sql`LIMIT ${limit + 1}` : Prisma.empty}
  `

  let page = rows
  let nextCursor: string | null = null
  if (limit !== undefined && rows.length > limit) {
    page = rows.slice(0, limit)
    const last = page[page.length - 1]
    nextCursor = last ? encodeThreadCursor(last.lmat, last.id) : null
  }

  return { ids: page.map(row => row.id), nextCursor }
}
