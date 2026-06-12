import { db, Prisma } from "@shopkeeper/db";
import type { SupportStatsSummary } from "./support-stats-types.js";

export {
  SUPPORT_STATS_DEFAULT_DAYS,
  SUPPORT_STATS_MAX_DAYS,
  clampSupportStatsDays,
  type SupportStatsSummary,
} from "./support-stats-types.js";

// Must stay in sync with canonicalInboxThreadSql in
// apps/dashboard/src/lib/messaging/inbox-filter.ts so stats match the inbox.
function inboxThreadSql(orgId: string) {
  return Prisma.sql`
    t.organization_id = ${orgId}::uuid
    AND t.channel_type NOT IN ('sms_agent', 'dashboard_agent')
    AND t.archived_at IS NULL
    AND t.deleted_at IS NULL
    AND t.filter_status <> 'filtered'
  `;
}

export async function getSupportStats(orgId: string, days: number): Promise<SupportStatsSummary> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  const [tagRows, channelRows, dayRows, senderRows, resolutionRows] = await Promise.all([
    db.$queryRaw<{ tag: string; count: bigint }[]>`
      SELECT COALESCE(t.tag, 'General') AS tag, COUNT(*)::bigint AS count
      FROM threads t
      WHERE ${inboxThreadSql(orgId)}
        AND t.created_at >= ${from}
      GROUP BY COALESCE(t.tag, 'General')
      ORDER BY count DESC
    `,
    db.$queryRaw<{ channel: string; count: bigint }[]>`
      SELECT t.channel_type::text AS channel, COUNT(*)::bigint AS count
      FROM threads t
      WHERE ${inboxThreadSql(orgId)}
        AND t.created_at >= ${from}
      GROUP BY t.channel_type
      ORDER BY count DESC
    `,
    db.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('day', t.created_at), 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS count
      FROM threads t
      WHERE ${inboxThreadSql(orgId)}
        AND t.created_at >= ${from}
      GROUP BY 1
      ORDER BY 1
    `,
    db.$queryRaw<{ sender: string; count: bigint }[]>`
      SELECT m.sender_type::text AS sender, COUNT(*)::bigint AS count
      FROM messages m
      JOIN threads t ON t.id = m.thread_id
      WHERE ${inboxThreadSql(orgId)}
        AND m.deleted_at IS NULL
        AND m.sent_at >= ${from}
        AND m.sender_type IN ('customer', 'agent', 'ai')
      GROUP BY m.sender_type
    `,
    db.$queryRaw<{ avg_minutes: number | null; closed_count: bigint }[]>`
      SELECT
        AVG(EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 60)::float AS avg_minutes,
        COUNT(*)::bigint AS closed_count
      FROM threads t
      WHERE ${inboxThreadSql(orgId)}
        AND t.created_at >= ${from}
        AND t.status = 'closed'
    `,
  ]);

  const senderCounts = Object.fromEntries(senderRows.map((row) => [row.sender, Number(row.count)]));
  const resolution = resolutionRows[0] ?? { avg_minutes: null, closed_count: BigInt(0) };

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    tickets: {
      total: tagRows.reduce((sum, row) => sum + Number(row.count), 0),
      byTag: tagRows.map((row) => ({ tag: row.tag, count: Number(row.count) })),
      byChannel: channelRows.map((row) => ({ channel: row.channel, count: Number(row.count) })),
      byDay: dayRows.map((row) => ({ day: row.day, count: Number(row.count) })),
    },
    messages: {
      customer: senderCounts.customer ?? 0,
      agent: senderCounts.agent ?? 0,
      ai: senderCounts.ai ?? 0,
    },
    resolution: {
      closedCount: Number(resolution.closed_count),
      avgMinutes: resolution.avg_minutes != null ? Math.round(resolution.avg_minutes) : null,
    },
  };
}
