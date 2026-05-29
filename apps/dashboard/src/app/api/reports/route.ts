import { NextResponse } from 'next/server'
import { db } from '@clerk/db'
import { BadRequestError } from '@/lib/api/errors'
import { withOrgRoute } from '@/lib/api/route'
import { listAgentTurnsForOrgInRange } from '@/lib/agent/api/action-log'

export const dynamic = 'force-dynamic'

export const GET = withOrgRoute(
  {
    context: 'Reports GET',
    errorMessage: 'Failed to fetch reports',
    rateLimit: { key: 'reports', limit: 10, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url)
    const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : new Date()
    const from = searchParams.get('from')
      ? new Date(searchParams.get('from')!)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)

    if (isNaN(to.getTime()) || isNaN(from.getTime())) {
      throw new BadRequestError('Invalid date range')
    }

    const [
      threadStatusCounts,
      channelCounts,
      tagCounts,
      firstReplyStats,
      agentTurns,
      customerStats,
      topCustomers,
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
        take: 6,
      }),

      db.$queryRaw<{ avg_minutes: number | null; measured_count: bigint }[]>`
        WITH first_msgs AS (
          SELECT
            t.id,
            MIN(CASE WHEN m.sender_type = 'customer' THEN m.sent_at END) AS first_customer,
            MIN(CASE WHEN m.sender_type IN ('agent', 'ai') THEN m.sent_at END) AS first_response
          FROM threads t
          INNER JOIN messages m ON m.thread_id = t.id AND m.deleted_at IS NULL
          WHERE t.organization_id = ${org.id}::uuid
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

      listAgentTurnsForOrgInRange(org.id, from, to),

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

    // Support stats , derive closedCount from the status groupBy, no extra query needed
    const byStatus = Object.fromEntries(threadStatusCounts.map(r => [r.status, r._count.id]))
    const totalThreads = threadStatusCounts.reduce((s, r) => s + r._count.id, 0)
    const closedCount = byStatus['closed'] ?? 0
    const firstReply = firstReplyStats[0] ?? { avg_minutes: null, measured_count: BigInt(0) }

    // Agent stats , parse turn notes
    const toolCounts: Record<string, number> = {}
    let totalRuns = 0

    for (const turn of agentTurns) {
      totalRuns++
      for (const action of turn.actions ?? []) {
        toolCounts[action.tool] = (toolCounts[action.tool] ?? 0) + 1
      }
    }

    const topTools = Object.entries(toolCounts)
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const stats = customerStats[0] ?? { unique_customers: BigInt(0), repeat_count: BigInt(0) }

    return NextResponse.json({
      window: { from: from.toISOString(), to: to.toISOString() },
      support: {
        total: totalThreads,
        closed: closedCount,
        openAndPending: (byStatus['open'] ?? 0) + (byStatus['pending'] ?? 0),
        resolutionRate: totalThreads > 0 ? Math.round((closedCount / totalThreads) * 100) : 0,
        avgFirstReplyMinutes: firstReply.avg_minutes != null ? Math.round(firstReply.avg_minutes) : null,
        firstReplyCount: Number(firstReply.measured_count),
        byChannel: channelCounts.map(r => ({ channel: r.channelType, count: r._count.id })),
        byTag: tagCounts.map(r => ({ tag: r.tag!, count: r._count.id })),
      },
      agent: {
        totalRuns,
        refundsIssued: toolCounts['create_refund'] ?? 0,
        cancellations: toolCounts['cancel_order'] ?? 0,
        orderEdits: toolCounts['edit_shopify_order'] ?? 0,
        ordersCreated: toolCounts['create_shopify_order'] ?? 0,
        repliesSent: toolCounts['send_reply'] ?? 0,
        addressUpdates: toolCounts['update_shopify_order_address'] ?? 0,
        topTools,
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
