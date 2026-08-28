import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { readFlagOrderFinding } from '@shopkeeper/agent/order-ops-finding';
import { withOrgRoute } from '@/lib/api/route';
import { canonicalInboxThreadWhere } from '@/lib/messaging/inbox-filter';

export const dynamic = 'force-dynamic';

const LIMIT = 12;

export interface OrderAttentionFinding {
  id: string;
  orderId: string | null;
  orderName: string;
  reason: string;
  at: string;
}

export interface OrderAttentionReturn {
  threadId: string;
  customerName: string;
  summary: string | null;
  at: string;
}

// Order-ops findings persist as flag_order AgentAction rows. `readFlagOrderFinding`
// owns how one is read back — structurally for rows written since the identity
// was recorded on the action input, off the summary sentence for older ones. It
// lives beside the producer so the two cannot drift; this route only reshapes
// what it returns for the client.
export function parseFlagOrderRow(row: {
  id: string;
  input: unknown;
  instruction: string | null;
  summary: string | null;
  executedAt: Date;
}): OrderAttentionFinding {
  const { orderId, orderName, reason } = readFlagOrderFinding(row);
  return { id: row.id, orderId, orderName, reason, at: row.executedAt.toISOString() };
}

export const GET = withOrgRoute(
  {
    context: 'Orders attention GET',
    errorMessage: 'Failed to fetch order attention',
    rateLimit: { key: 'orders:attention', limit: 30, windowSecs: 60 },
  },
  async ({ org }) => {
    // Findings reference an order on the Shopify store that was connected when
    // they were generated. A reconnect/reinstall wipes those orders, so scope
    // findings to the current connection window — anything older points at an
    // order that no longer exists on the connected store.
    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify', accessToken: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const [flagRows, returnThreads] = await Promise.all([
      integration
        ? db.agentAction.findMany({
            // status must be 'escalated', not merely present: runOrderOps only
            // treats a flag_order call as a finding when it comes back escalated,
            // and rows written before 2026-08-04 recorded 'success' under older
            // plumbing. Matching on the same condition keeps this feed's
            // definition of "flagged" identical to the module's.
            where: {
              organizationId: org.id,
              tool: 'flag_order',
              status: 'escalated',
              executedAt: { gte: integration.createdAt },
            },
            orderBy: { executedAt: 'desc' },
            take: LIMIT,
            select: { id: true, input: true, instruction: true, summary: true, executedAt: true },
          })
        : [],
      db.thread.findMany({
        where: { ...canonicalInboxThreadWhere(org.id), status: 'open', tag: 'Returns' },
        orderBy: { lastMessageAt: 'desc' },
        take: LIMIT,
        select: {
          id: true,
          lastMessageAt: true,
          aiSummary: true,
          aiTitle: true,
          customer: { select: { name: true, platformId: true } },
        },
      }),
    ]);

    const findings = flagRows.map(parseFlagOrderRow);
    const returns: OrderAttentionReturn[] = returnThreads.map((thread) => ({
      threadId: thread.id,
      customerName: thread.customer.name || thread.customer.platformId,
      summary: thread.aiSummary || thread.aiTitle || null,
      at: thread.lastMessageAt.toISOString(),
    }));

    return NextResponse.json({ findings, returns });
  },
);
