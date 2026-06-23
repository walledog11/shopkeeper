import { Prisma, db as defaultDb } from "@shopkeeper/db"
import { SUPPORTED_AGENT_PLAN_CACHE_VERSIONS } from "@shopkeeper/agent/plan-cache-shape"
import { canonicalInboxThreadSql } from "@/lib/messaging/inbox-filter"

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
  options?: { cursor?: string; limit?: number },
  db: Pick<typeof defaultDb, "$queryRaw"> = defaultDb,
) {
  const where = inboxScopeSql(organizationId, filters)
  const limit = options?.limit
  const cursor = options?.cursor

  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT t.id
    FROM threads t
    WHERE ${where}
    ${cursor ? Prisma.sql`AND t.id < ${cursor}::uuid` : Prisma.empty}
    ORDER BY t.last_message_at DESC, t.id DESC
    ${limit !== undefined ? Prisma.sql`LIMIT ${limit + 1}` : Prisma.empty}
  `

  let ids = rows.map(row => row.id)
  let nextCursor: string | null = null
  if (limit !== undefined && ids.length > limit) {
    ids = ids.slice(0, limit)
    nextCursor = ids[ids.length - 1] ?? null
  }

  return { ids, nextCursor }
}
