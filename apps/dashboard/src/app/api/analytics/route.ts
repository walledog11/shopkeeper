import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

const RANGE_TO_DAYS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
} as const;

export async function GET(request: Request) {
  try {
    const org = await getOrCreateOrg();

    const rl = await rateLimit(`analytics:${org.id}`, 10, 60);
    if (!rl.success) return tooManyRequests(rl.reset);
    const { searchParams } = new URL(request.url);

    const range = searchParams.get('range');
    const hasExplicitBounds = searchParams.has('from') || searchParams.has('to');

    const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : new Date();

    let from: Date;
    if (searchParams.get('from')) {
      from = new Date(searchParams.get('from')!);
    } else if (!hasExplicitBounds && range && range in RANGE_TO_DAYS) {
      from = new Date(to.getTime() - RANGE_TO_DAYS[range as keyof typeof RANGE_TO_DAYS] * 24 * 60 * 60 * 1000);
    } else {
      from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    if (isNaN(to.getTime()) || isNaN(from.getTime())) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    }

    if (range && !(range in RANGE_TO_DAYS) && !hasExplicitBounds) {
      return NextResponse.json({ error: 'Invalid range' }, { status: 400 });
    }

    const [
      threadStatusCounts,
      channelCounts,
      tagCounts,
      resolutionStats,
      messageSenderCounts,
      threadVolumeByDay,
      firstReplyStats,
    ] = await Promise.all([
      db.thread.groupBy({
        by: ['status'],
        where: { organizationId: org.id, deletedAt: null, createdAt: { gte: from, lte: to } },
        _count: { id: true },
      }),

      db.thread.groupBy({
        by: ['channelType'],
        where: { organizationId: org.id, deletedAt: null, createdAt: { gte: from, lte: to } },
        _count: { id: true },
      }),

      db.thread.groupBy({
        by: ['tag'],
        where: {
          organizationId: org.id,
          deletedAt: null,
          createdAt: { gte: from, lte: to },
          tag: { not: null },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 8,
      }),

      db.$queryRaw<{ avg_minutes: number | null; closed_count: bigint }[]>`
        SELECT
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60)::float AS avg_minutes,
          COUNT(*)::bigint AS closed_count
        FROM threads
        WHERE organization_id = ${org.id}
          AND status = 'closed'
          AND deleted_at IS NULL
          AND created_at >= ${from}
          AND created_at <= ${to}
      `,

      db.$queryRaw<{ sender_type: string; count: bigint }[]>`
        SELECT m.sender_type, COUNT(*) AS count
        FROM messages m
        INNER JOIN threads t ON t.id = m.thread_id
        WHERE t.organization_id = ${org.id}
          AND t.created_at >= ${from}
          AND t.created_at <= ${to}
          AND m.deleted_at IS NULL
        GROUP BY m.sender_type
      `,

      db.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*) AS count
        FROM threads
        WHERE organization_id = ${org.id}
          AND created_at >= ${from}
          AND created_at <= ${to}
          AND deleted_at IS NULL
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY day ASC
      `,

      db.$queryRaw<{ avg_minutes: number | null; measured_count: bigint }[]>`
        WITH first_msgs AS (
          SELECT
            t.id,
            MIN(CASE WHEN m.sender_type = 'customer' THEN m.sent_at END) AS first_customer,
            MIN(CASE WHEN m.sender_type IN ('agent', 'ai') THEN m.sent_at END) AS first_response
          FROM threads t
          INNER JOIN messages m ON m.thread_id = t.id AND m.deleted_at IS NULL
          WHERE t.organization_id = ${org.id}
            AND t.created_at >= ${from}
            AND t.created_at <= ${to}
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
      `,
    ]);

    const byStatus = Object.fromEntries(threadStatusCounts.map(r => [r.status, r._count.id]));
    const totalThreads = threadStatusCounts.reduce((s, r) => s + r._count.id, 0);

    const resolution = resolutionStats[0] ?? { avg_minutes: null, closed_count: BigInt(0) };
    const closedCount = Number(resolution.closed_count);
    const avgResolutionMinutes = resolution.avg_minutes != null ? Math.round(resolution.avg_minutes) : null;

    const senderCounts = Object.fromEntries(
      messageSenderCounts.map(r => [r.sender_type, Number(r.count)]),
    );
    const totalMessages = Object.values(senderCounts).reduce((s, n) => s + n, 0);

    const aiReplies = senderCounts['ai'] ?? 0;
    const agentReplies = senderCounts['agent'] ?? 0;
    const totalReplies = aiReplies + agentReplies;

    const firstReply = firstReplyStats[0] ?? { avg_minutes: null, measured_count: BigInt(0) };

    return NextResponse.json({
      window: { from: from.toISOString(), to: to.toISOString() },
      threads: {
        total: totalThreads,
        byStatus,
        byChannel: channelCounts.map(r => ({ channel: r.channelType, count: r._count.id })),
        byTag: tagCounts.map(r => ({ tag: r.tag!, count: r._count.id })),
        volumeByDay: threadVolumeByDay.map(r => ({
          day: (r.day as Date).toISOString().slice(0, 10),
          count: Number(r.count),
        })),
      },
      messages: {
        total: totalMessages,
        bySender: senderCounts,
      },
      resolution: {
        avgMinutes: avgResolutionMinutes,
        closedCount,
        rate: totalThreads > 0 ? Math.round((closedCount / totalThreads) * 100) : 0,
      },
      firstReply: {
        avgMinutes: firstReply.avg_minutes != null ? Math.round(firstReply.avg_minutes) : null,
        measuredCount: Number(firstReply.measured_count),
      },
      aiUsage: {
        aiReplies,
        agentReplies,
        aiReplyPct: totalReplies > 0 ? Math.round((aiReplies / totalReplies) * 100) : null,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Analytics GET', 'Failed to fetch analytics');
  }
}
