import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { withOrgRoute } from '@/lib/api/route';
import {
  ANALYTICS_TAG_LIMIT,
  getThreadReportingMetricsForRange,
  parseReportingDateRange,
} from '@/lib/server/reporting';

export const dynamic = 'force-dynamic';

export const GET = withOrgRoute(
  {
    context: 'Analytics GET',
    errorMessage: 'Failed to fetch analytics',
    rateLimit: { key: 'analytics', limit: 10, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url);
    const dateRange = parseReportingDateRange(searchParams, { allowRangePreset: true });
    const { from, to } = dateRange;

    const [
      threadMetrics,
      resolutionStats,
      messageSenderCounts,
      threadVolumeByDay,
    ] = await Promise.all([
      getThreadReportingMetricsForRange(org.id, dateRange, { tagLimit: ANALYTICS_TAG_LIMIT }),

      db.$queryRaw<{ avg_minutes: number | null; closed_count: bigint }[]>`
        SELECT
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60)::float AS avg_minutes,
          COUNT(*)::bigint AS closed_count
        FROM threads
        WHERE organization_id = ${org.id}::uuid
          AND status = 'closed'
          AND deleted_at IS NULL
          AND created_at >= ${from}
          AND created_at <= ${to}
      `,

      db.$queryRaw<{ sender_type: string; count: bigint }[]>`
        SELECT m.sender_type, COUNT(*) AS count
        FROM messages m
        INNER JOIN threads t ON t.id = m.thread_id
        WHERE t.organization_id = ${org.id}::uuid
          AND t.created_at >= ${from}
          AND t.created_at <= ${to}
          AND m.deleted_at IS NULL
        GROUP BY m.sender_type
      `,

      db.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*) AS count
        FROM threads
        WHERE organization_id = ${org.id}::uuid
          AND created_at >= ${from}
          AND created_at <= ${to}
          AND deleted_at IS NULL
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY day ASC
      `,
    ]);

    const byStatus = threadMetrics.byStatus;
    const totalThreads = threadMetrics.total;

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

    return NextResponse.json({
      window: { from: from.toISOString(), to: to.toISOString() },
      threads: {
        total: totalThreads,
        byStatus,
        byChannel: threadMetrics.byChannel,
        byTag: threadMetrics.byTag,
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
        avgMinutes: threadMetrics.firstReply.avgMinutes,
        measuredCount: threadMetrics.firstReply.measuredCount,
      },
      aiUsage: {
        aiReplies,
        agentReplies,
        aiReplyPct: totalReplies > 0 ? Math.round((aiReplies / totalReplies) * 100) : null,
      },
    });
  },
);
