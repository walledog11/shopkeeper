import { NextResponse } from 'next/server'
import { db } from '@clerk/db'
import { withOrgRoute } from '@/lib/api/route'
import { getAgentActionReportStatsForOrgInRange } from '@/lib/agent/api/action-log'
import {
  REPORTS_TAG_LIMIT,
  getThreadReportingMetricsForRange,
  parseReportingDateRange,
} from '@/lib/server/reporting'

export const dynamic = 'force-dynamic'

export const GET = withOrgRoute(
  {
    context: 'Reports GET',
    errorMessage: 'Failed to fetch reports',
    rateLimit: { key: 'reports', limit: 10, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url)
    const dateRange = parseReportingDateRange(searchParams)
    const { from, to } = dateRange

    const [
      threadMetrics,
      agentStats,
      customerStats,
      topCustomers,
    ] = await Promise.all([
      getThreadReportingMetricsForRange(org.id, dateRange, { tagLimit: REPORTS_TAG_LIMIT }),

      getAgentActionReportStatsForOrgInRange(org.id, from, to),

      // Unique + repeat customers in one scan
      db.$queryRaw<{ unique_customers: bigint; repeat_count: bigint }[]>`
        SELECT
          COUNT(DISTINCT customer_id)::bigint AS unique_customers,
          COUNT(*) FILTER (WHERE thread_count >= 3)::bigint AS repeat_count
        FROM (
          SELECT customer_id, COUNT(*) AS thread_count
          FROM threads
          WHERE organization_id = ${org.id}::uuid
            AND created_at >= ${from}
            AND created_at <= ${to}
            AND deleted_at IS NULL
          GROUP BY customer_id
        ) sub
      `,

      db.$queryRaw<{ name: string | null; platform_id: string; ticket_count: bigint }[]>`
        SELECT c.name, c.platform_id, COUNT(t.id)::bigint AS ticket_count
        FROM threads t
        INNER JOIN customers c ON c.id = t.customer_id
        WHERE t.organization_id = ${org.id}::uuid
          AND t.created_at >= ${from}
          AND t.created_at <= ${to}
          AND t.deleted_at IS NULL
        GROUP BY c.id, c.name, c.platform_id
        ORDER BY ticket_count DESC
        LIMIT 5
      `,
    ])

    // Support stats , derive closedCount from the status query, no extra query needed
    const byStatus = threadMetrics.byStatus
    const totalThreads = threadMetrics.total
    const closedCount = byStatus['closed'] ?? 0

    const stats = customerStats[0] ?? { unique_customers: BigInt(0), repeat_count: BigInt(0) }

    return NextResponse.json({
      window: { from: from.toISOString(), to: to.toISOString() },
      support: {
        total: totalThreads,
        closed: closedCount,
        openAndPending: (byStatus['open'] ?? 0) + (byStatus['pending'] ?? 0),
        resolutionRate: totalThreads > 0 ? Math.round((closedCount / totalThreads) * 100) : 0,
        avgFirstReplyMinutes: threadMetrics.firstReply.avgMinutes,
        firstReplyCount: threadMetrics.firstReply.measuredCount,
        byChannel: threadMetrics.byChannel,
        byTag: threadMetrics.byTag,
      },
      agent: {
        totalRuns: agentStats.totalRuns,
        refundsIssued: agentStats.toolCounts['create_refund'] ?? 0,
        cancellations: agentStats.toolCounts['cancel_order'] ?? 0,
        orderEdits: agentStats.toolCounts['edit_shopify_order'] ?? 0,
        ordersCreated: agentStats.toolCounts['create_shopify_order'] ?? 0,
        repliesSent: agentStats.toolCounts['send_reply'] ?? 0,
        addressUpdates: agentStats.toolCounts['update_shopify_order_address'] ?? 0,
        topTools: agentStats.topTools,
      },
      customers: {
        unique: Number(stats.unique_customers),
        repeat: Number(stats.repeat_count),
        top: topCustomers.map(r => ({
          name: r.name,
          platformId: r.platform_id,
          count: Number(r.ticket_count),
        })),
      },
    })
  },
)
