import { Prisma, db as defaultDb } from "@shopkeeper/db"

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

export type ThreadListSqlFilters = {
  wantsFiltered?: boolean
  /** Omit to interleave open and closed under one cursor. */
  status?: "open" | "closed"
}

function inboxScopeSql(organizationId: string, filters: ThreadListSqlFilters) {
  if (filters.wantsFiltered) {
    return Prisma.sql`
      t.deleted_at IS NULL
      AND t.archived_at IS NULL
      AND t.organization_id = ${organizationId}::uuid
      AND t.channel_type NOT IN ('sms_agent', 'dashboard_agent')
      AND t.filter_status = 'filtered'
    `
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
