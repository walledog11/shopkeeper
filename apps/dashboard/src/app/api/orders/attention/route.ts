import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
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

// Order-ops findings persist as flag_order AgentAction rows. The order id lives
// in the turn instruction ("order-risk-review:<id>") and the name in the turn
// summary ("Flagged order <name> for review: <reason>"); the reason is the
// flag_order tool input. Parsing stays here so the client gets a clean shape.
export function parseFlagOrderRow(row: {
  id: string;
  input: unknown;
  instruction: string | null;
  summary: string | null;
  executedAt: Date;
}): OrderAttentionFinding {
  const orderId = row.instruction?.startsWith('order-risk-review:')
    ? row.instruction.slice('order-risk-review:'.length).trim() || null
    : null;
  const nameMatch = row.summary?.match(/^Flagged order (.+?) for review:/);
  const orderName = nameMatch?.[1]?.trim() || (orderId ? `Order ${orderId}` : 'An order');
  const inputReason =
    row.input && typeof row.input === 'object' && 'reason' in row.input
      ? String((row.input as { reason: unknown }).reason ?? '').trim()
      : '';
  const summaryReason = row.summary?.split(' for review:')[1]?.trim() ?? '';
  return {
    id: row.id,
    orderId,
    orderName,
    reason: inputReason || summaryReason || 'Flagged for review',
    at: row.executedAt.toISOString(),
  };
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
            where: { organizationId: org.id, tool: 'flag_order', executedAt: { gte: integration.createdAt } },
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
