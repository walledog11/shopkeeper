import { db } from '@shopkeeper/db';
import {
  listOpenReturnWatches,
  markReturnWatchPlanPushed,
  markReturnWatchSkipped,
  ensureReturnWatchFromDelivery,
  type ReturnWatchTool,
} from '@shopkeeper/db';
import {
  safeFetchOrderReturnStatuses,
  type ShopifyContext,
} from '@shopkeeper/agent/shopify';
import { isReturnLifecycleMonitorEnabled } from '../config/runtime-config.js';
import logger from '../logger.js';
import { JOB, QUEUE } from '../constants.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  ONE_HOUR_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';
import { pushReturnArrivalApprovalPlan } from './return-arrival-plan.js';

export { returnArrivedIdempotencyKey } from './return-arrival-plan.js';

const LOOKBACK_DAYS = 90;
const ACTIONS_PER_ORG = 25;

export interface OpenReturnCandidate {
  organizationId: string;
  threadId: string | null;
  orderId: string;
  customerName: string | null;
  executedAt: Date;
  tool: ReturnWatchTool;
}

function readOrderId(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const orderId = (input as { order_id?: unknown }).order_id;
  if (typeof orderId === 'string' || typeof orderId === 'number') {
    return String(orderId);
  }
  return null;
}

function toolFromAction(tool: string): ReturnWatchTool | null {
  if (tool === 'create_return' || tool === 'create_exchange') return tool;
  return null;
}

// Legacy bridge: infer open returns from recent successful audit rows when a
// durable ReturnWatch row does not exist yet (pre-migration actions).
export async function loadLegacyOpenReturnCandidates(organizationId: string): Promise<OpenReturnCandidate[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3_600_000);
  const actions = await db.agentAction.findMany({
    where: {
      organizationId,
      tool: { in: ['create_return', 'create_exchange'] },
      status: 'success',
      executedAt: { gte: since },
    },
    orderBy: { executedAt: 'desc' },
    take: ACTIONS_PER_ORG,
    select: {
      threadId: true,
      input: true,
      executedAt: true,
      tool: true,
      thread: { select: { customer: { select: { name: true } } } },
    },
  });

  const seen = new Set<string>();
  const candidates: OpenReturnCandidate[] = [];
  for (const action of actions) {
    const orderId = readOrderId(action.input);
    const tool = toolFromAction(action.tool);
    if (!orderId || !tool || seen.has(orderId)) continue;
    seen.add(orderId);
    candidates.push({
      organizationId,
      threadId: action.threadId,
      orderId,
      customerName: action.thread?.customer?.name ?? null,
      executedAt: action.executedAt,
      tool,
    });
  }
  return candidates;
}

async function handleDeliveredReturn(params: {
  organizationId: string;
  watchId: string;
  threadId: string | null;
  orderId: string;
  shopifyReturnId: string;
  returnName: string | null;
  tool: ReturnWatchTool;
  customerName: string | null;
}): Promise<boolean> {
  const outcome = await pushReturnArrivalApprovalPlan(params.organizationId, {
    id: params.watchId,
    threadId: params.threadId,
    orderId: params.orderId,
    shopifyReturnId: params.shopifyReturnId,
    returnName: params.returnName,
    tool: params.tool,
    customerName: params.customerName,
  });

  if (outcome === 'plan_pushed' || outcome === 'notify_only') {
    const marked = await markReturnWatchPlanPushed(params.watchId, params.organizationId);
    if (!marked) {
      logger.info(
        { organizationId: params.organizationId, watchId: params.watchId },
        '[ReturnLifecycleMonitor] arrival already handled on another worker',
      );
    }
    return true;
  }

  await markReturnWatchSkipped(params.watchId, params.organizationId);
  return false;
}

export async function runReturnLifecycleMonitor(): Promise<{
  orgsScanned: number;
  returnsChecked: number;
  arrivalsNotified: number;
}> {
  if (!isReturnLifecycleMonitorEnabled()) {
    return { orgsScanned: 0, returnsChecked: 0, arrivalsNotified: 0 };
  }

  const integrations = await db.integration.findMany({
    where: { platform: 'shopify', accessToken: { not: null } },
    select: { organizationId: true, externalAccountId: true, accessToken: true },
  });

  let returnsChecked = 0;
  let arrivalsNotified = 0;

  for (const integration of integrations) {
    if (!integration.accessToken || !integration.externalAccountId) continue;
    const ctx: ShopifyContext = {
      shop: integration.externalAccountId,
      accessToken: integration.accessToken,
    };

    const watches = await listOpenReturnWatches(integration.organizationId);
    const watchedReturnIds = new Set(watches.map((watch) => watch.shopifyReturnId));

    for (const watch of watches) {
      const statuses = await safeFetchOrderReturnStatuses(ctx, watch.orderId);
      if (!statuses) {
        logger.warn(
          { organizationId: integration.organizationId, orderId: watch.orderId, watchId: watch.id },
          '[ReturnLifecycleMonitor] return status fetch failed',
        );
        continue;
      }

      const status = statuses.find((row) => row.returnId === watch.shopifyReturnId);
      if (!status) continue;
      returnsChecked += 1;
      if (status.deliveryState !== 'delivered') continue;

      const notified = await handleDeliveredReturn({
        organizationId: integration.organizationId,
        watchId: watch.id,
        threadId: watch.threadId,
        orderId: watch.orderId,
        shopifyReturnId: watch.shopifyReturnId,
        returnName: status.returnName ?? watch.returnName,
        tool: watch.tool as ReturnWatchTool,
        customerName: watch.thread?.customer?.name ?? null,
      });
      if (notified) {
        arrivalsNotified += 1;
        logger.info(
          {
            organizationId: integration.organizationId,
            orderId: watch.orderId,
            returnId: watch.shopifyReturnId,
            threadId: watch.threadId,
            watchId: watch.id,
          },
          '[ReturnLifecycleMonitor] pushed return-arrival approval plan',
        );
      }
    }

    const legacyCandidates = await loadLegacyOpenReturnCandidates(integration.organizationId);
    for (const candidate of legacyCandidates) {
      const statuses = await safeFetchOrderReturnStatuses(ctx, candidate.orderId);
      if (!statuses) continue;

      for (const status of statuses) {
        if (status.deliveryState !== 'delivered' || watchedReturnIds.has(status.returnId)) continue;
        returnsChecked += 1;

        const watchId = await ensureReturnWatchFromDelivery({
          organizationId: integration.organizationId,
          threadId: candidate.threadId,
          orderId: candidate.orderId,
          shopifyReturnId: status.returnId,
          returnName: status.returnName,
          tool: candidate.tool,
        });
        watchedReturnIds.add(status.returnId);

        const notified = await handleDeliveredReturn({
          organizationId: integration.organizationId,
          watchId,
          threadId: candidate.threadId,
          orderId: candidate.orderId,
          shopifyReturnId: status.returnId,
          returnName: status.returnName,
          tool: candidate.tool,
          customerName: candidate.customerName,
        });
        if (notified) {
          arrivalsNotified += 1;
          logger.info(
            {
              organizationId: integration.organizationId,
              orderId: candidate.orderId,
              returnId: status.returnId,
              threadId: candidate.threadId,
              watchId,
              legacy: true,
            },
            '[ReturnLifecycleMonitor] backfilled legacy return watch and pushed approval plan',
          );
        }
      }
    }
  }

  return {
    orgsScanned: integrations.length,
    returnsChecked,
    arrivalsNotified,
  };
}

export const registerReturnLifecycleMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.RETURN_LIFECYCLE);
  await scheduleRepeatableJob(queue, JOB.RETURN_LIFECYCLE_SCAN, JOB.RETURN_LIFECYCLE_ID, ONE_HOUR_MS);

  const worker = createMaintenanceWorker(context, QUEUE.RETURN_LIFECYCLE, runReturnLifecycleMonitor, {
    label: 'ReturnLifecycle',
    failureQueue: QUEUE.RETURN_LIFECYCLE,
  });

  return { workers: [worker], queues: [queue] };
};
