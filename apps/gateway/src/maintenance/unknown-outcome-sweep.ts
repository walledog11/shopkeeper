import { db } from '@shopkeeper/db';
import { runUnknownOutcomeReconciliation } from '@shopkeeper/agent/unknown-outcome-reconciliation';
import type { ShopifyContext } from '@shopkeeper/agent/shopify';
import { JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

// Backstop for ambiguous Shopify mutations and goodwill reservations left in
// `unknown`, plus stale `claimed` plan executions and stale `reserved` spend
// rows that never reached a provider. This sweep only performs read probes and
// terminal ledger updates; it never replays an approved plan or mutates Shopify.
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

async function loadShopifyContext(organizationId: string): Promise<ShopifyContext | null> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify', accessToken: { not: null } },
    select: { externalAccountId: true, accessToken: true },
  });
  if (!integration?.accessToken || !integration.externalAccountId) return null;
  return { shop: integration.externalAccountId, accessToken: integration.accessToken };
}

export async function runUnknownOutcomeSweep(): Promise<void> {
  const result = await runUnknownOutcomeReconciliation({ loadShopifyContext });

  const needsAttention = result.staleClaimedExecutions > 0
    || result.stillUnknownExecutions > 0
    || result.stillUnknownReservations > 0;

  if (needsAttention) {
    logger.error(
      { opsAlert: true, ...result },
      '[UnknownOutcomeSweep] Reconciled ambiguous provider outcomes',
    );
    return;
  }

  if (
    result.staleReleasedReservations > 0
    || result.resolvedExecutions > 0
    || result.resolvedReservations > 0
  ) {
    logger.info({ ...result }, '[UnknownOutcomeSweep] Reconciled ambiguous provider outcomes');
  }
}

export const registerUnknownOutcomeSweepMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.UNKNOWN_OUTCOME_SWEEP);
  await scheduleRepeatableJob(
    queue,
    JOB.UNKNOWN_OUTCOME_SWEEP,
    JOB.UNKNOWN_OUTCOME_SWEEP_ID,
    SWEEP_INTERVAL_MS,
  );

  const worker = createMaintenanceWorker(context, QUEUE.UNKNOWN_OUTCOME_SWEEP, runUnknownOutcomeSweep, {
    label: 'UnknownOutcomeSweep',
    failureQueue: 'unknown-outcome-sweep',
  });

  return { workers: [worker], queues: [queue] };
};
