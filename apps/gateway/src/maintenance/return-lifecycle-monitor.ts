import { db } from '@shopkeeper/db';
import {
  formatReturnArrivedNotification,
  safeFetchOrderReturnStatuses,
  type ShopifyContext,
} from '@shopkeeper/agent/shopify';
import { isReturnLifecycleMonitorEnabled } from '../config/runtime-config.js';
import logger from '../logger.js';
import { JOB, QUEUE } from '../constants.js';
import { listOperatorBindings, notifyOperator } from '../operator-notify.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  ONE_HOUR_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

const LOOKBACK_DAYS = 90;
const ACTIONS_PER_ORG = 25;

export interface OpenReturnCandidate {
  organizationId: string;
  threadId: string | null;
  orderId: string;
  customerName: string | null;
  executedAt: Date;
}

function readOrderId(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const orderId = (input as { order_id?: unknown }).order_id;
  if (typeof orderId === 'string' || typeof orderId === 'number') {
    return String(orderId);
  }
  return null;
}

export async function loadOpenReturnCandidates(organizationId: string): Promise<OpenReturnCandidate[]> {
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
      thread: { select: { customer: { select: { name: true } } } },
    },
  });

  const seen = new Set<string>();
  const candidates: OpenReturnCandidate[] = [];
  for (const action of actions) {
    const orderId = readOrderId(action.input);
    if (!orderId || seen.has(orderId)) continue;
    seen.add(orderId);
    candidates.push({
      organizationId,
      threadId: action.threadId,
      orderId,
      customerName: action.thread?.customer?.name ?? null,
      executedAt: action.executedAt,
    });
  }
  return candidates;
}

export function returnArrivedIdempotencyKey(
  organizationId: string,
  orderId: string,
  returnId: string,
): string {
  return `return-arrived:${organizationId}:${orderId}:${returnId}`;
}

export async function notifyReturnArrived(
  organizationId: string,
  candidate: OpenReturnCandidate,
  returnName: string | null,
  returnId: string,
): Promise<number> {
  const message = formatReturnArrivedNotification({
    customerName: candidate.customerName,
    orderId: candidate.orderId,
    returnName,
  });
  const bindings = await listOperatorBindings(organizationId);
  const idempotencyKey = returnArrivedIdempotencyKey(organizationId, candidate.orderId, returnId);
  let notified = 0;
  for (const member of bindings) {
    const result = await notifyOperator(organizationId, member, message, {}, { idempotencyKey });
    if (result) notified += 1;
  }
  return notified;
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
    const candidates = await loadOpenReturnCandidates(integration.organizationId);

    for (const candidate of candidates) {
      const statuses = await safeFetchOrderReturnStatuses(ctx, candidate.orderId);
      if (!statuses) {
        logger.warn(
          { organizationId: integration.organizationId, orderId: candidate.orderId },
          '[ReturnLifecycleMonitor] return status fetch failed',
        );
        continue;
      }

      returnsChecked += statuses.length;
      for (const status of statuses) {
        if (status.deliveryState !== 'delivered') continue;
        const notified = await notifyReturnArrived(
          integration.organizationId,
          candidate,
          status.returnName,
          status.returnId,
        );
        arrivalsNotified += notified;
        if (notified > 0) {
          logger.info(
            {
              organizationId: integration.organizationId,
              orderId: candidate.orderId,
              returnId: status.returnId,
              threadId: candidate.threadId,
            },
            '[ReturnLifecycleMonitor] notified operator of delivered return',
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
