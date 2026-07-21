import { db } from './index.js';

export type ReturnWatchTool = 'create_return' | 'create_exchange';

export interface RecordReturnWatchParams {
  organizationId: string;
  threadId: string | null;
  sourceAgentActionId?: string | null;
  orderId: string;
  shopifyReturnId: string;
  returnName: string | null;
  tool: ReturnWatchTool;
}

export async function recordReturnWatch(params: RecordReturnWatchParams): Promise<void> {
  await db.returnWatch.upsert({
    where: {
      organizationId_shopifyReturnId: {
        organizationId: params.organizationId,
        shopifyReturnId: params.shopifyReturnId,
      },
    },
    create: {
      organizationId: params.organizationId,
      threadId: params.threadId,
      sourceAgentActionId: params.sourceAgentActionId ?? null,
      orderId: params.orderId,
      shopifyReturnId: params.shopifyReturnId,
      returnName: params.returnName,
      tool: params.tool,
    },
    update: {
      threadId: params.threadId ?? undefined,
      orderId: params.orderId,
      returnName: params.returnName,
      tool: params.tool,
      ...(params.sourceAgentActionId ? { sourceAgentActionId: params.sourceAgentActionId } : {}),
    },
  });
}

export async function listOpenReturnWatches(organizationId: string, limit = 50) {
  return db.returnWatch.findMany({
    where: { organizationId, status: 'open' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      threadId: true,
      orderId: true,
      shopifyReturnId: true,
      returnName: true,
      tool: true,
      thread: { select: { customer: { select: { name: true } } } },
    },
  });
}

export async function markReturnWatchPlanPushed(
  watchId: string,
  organizationId: string,
): Promise<boolean> {
  const updated = await db.returnWatch.updateMany({
    where: { id: watchId, organizationId, status: 'open' },
    data: {
      status: 'plan_pushed',
      arrivedAt: new Date(),
      planPushedAt: new Date(),
    },
  });
  return updated.count === 1;
}

export async function markReturnWatchSkipped(
  watchId: string,
  organizationId: string,
): Promise<boolean> {
  const updated = await db.returnWatch.updateMany({
    where: { id: watchId, organizationId, status: 'open' },
    data: {
      status: 'skipped',
      arrivedAt: new Date(),
    },
  });
  return updated.count === 1;
}

export async function ensureReturnWatchFromDelivery(params: {
  organizationId: string;
  threadId: string | null;
  orderId: string;
  shopifyReturnId: string;
  returnName: string | null;
  tool: ReturnWatchTool;
}): Promise<string> {
  const row = await db.returnWatch.upsert({
    where: {
      organizationId_shopifyReturnId: {
        organizationId: params.organizationId,
        shopifyReturnId: params.shopifyReturnId,
      },
    },
    create: {
      organizationId: params.organizationId,
      threadId: params.threadId,
      orderId: params.orderId,
      shopifyReturnId: params.shopifyReturnId,
      returnName: params.returnName,
      tool: params.tool,
    },
    update: {
      threadId: params.threadId ?? undefined,
      orderId: params.orderId,
      returnName: params.returnName,
      tool: params.tool,
    },
    select: { id: true, status: true },
  });
  return row.id;
}
