import { db } from '@shopkeeper/db';
import {
  runUnknownOutcomeReconciliation,
  type UnknownOutcomeSweepCounts,
} from '@shopkeeper/agent/unknown-outcome-reconciliation';
import type { ShopifyContext } from '@shopkeeper/agent/shopify';
import { JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import { emitOpsAlert, incrementOpsAlertWindow, type OpsAlertCounterClient } from '../ops-alerts.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

// Backstop for ambiguous Shopify mutations and goodwill reservations left in
// `unknown`, plus stale `claimed` plan executions, dispatches and `reserved`
// spend rows, which it converts to `unknown` for the probes. This sweep only
// performs read probes and terminal ledger updates; it never replays an
// approved plan or mutates Shopify.
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
// What stays unknown after probing repeats on every sweep; the founder hears
// about each distinct set of counts once a day, not every 15 minutes.
const STILL_UNKNOWN_ALERT_WINDOW_SECS = 24 * 60 * 60;

async function loadShopifyContext(organizationId: string): Promise<ShopifyContext | null> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify', accessToken: { not: null } },
    select: { externalAccountId: true, accessToken: true },
  });
  if (!integration?.accessToken || !integration.externalAccountId) return null;
  return { shop: integration.externalAccountId, accessToken: integration.accessToken };
}

async function alertUnresolvedOutcomes(
  result: UnknownOutcomeSweepCounts,
  counterClient: OpsAlertCounterClient,
): Promise<void> {
  // Rows this run converted to unknown are newly stuck by definition.
  const newlyStuck = result.staleClaimedExecutions
    + result.staleActionDispatches
    + result.staleUnknownReservations;
  const stillUnknown = result.stillUnknownExecutions
    + result.stillUnknownStandaloneActions
    + result.stillUnknownReservations;
  if (newlyStuck === 0 && stillUnknown === 0) return;

  if (newlyStuck === 0) {
    // A counter failure alerts anyway: a repeat beats silence about stuck money.
    const window = await incrementOpsAlertWindow(counterClient, {
      keyParts: [
        'unknown_outcome_sweep',
        result.stillUnknownExecutions,
        result.stillUnknownStandaloneActions,
        result.stillUnknownReservations,
      ],
      threshold: 1,
      windowSecs: STILL_UNKNOWN_ALERT_WINDOW_SECS,
    }).catch((err: unknown) => {
      logger.warn({ err }, '[UnknownOutcomeSweep] Alert window unavailable; alerting without dedupe');
      return null;
    });
    if (window && !window.thresholdCrossed) {
      logger.warn({ ...result }, '[UnknownOutcomeSweep] Provider outcomes still unknown');
      return;
    }
  }

  emitOpsAlert({
    category: 'agent_failure',
    level: 'error',
    message: `Unknown provider outcomes need attention: ${newlyStuck} newly stuck, ${stillUnknown} still unknown after probing. Establish provider truth before any fresh instruction.`,
    tags: { source: 'unknown_outcome_sweep' },
    fingerprint: ['ops-alert', 'agent_failure', 'gateway', 'source:unknown_outcome_sweep'],
    extra: { ...result },
  });
}

async function runUnknownOutcomeSweep(counterClient: OpsAlertCounterClient): Promise<void> {
  const result = await runUnknownOutcomeReconciliation({ loadShopifyContext });

  await alertUnresolvedOutcomes(result, counterClient);

  if (
    result.resolvedExecutions > 0
    || result.resolvedStandaloneActions > 0
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

  const worker = createMaintenanceWorker(context, QUEUE.UNKNOWN_OUTCOME_SWEEP, () => runUnknownOutcomeSweep(context.producerConn), {
    label: 'UnknownOutcomeSweep',
    failureQueue: 'unknown-outcome-sweep',
  });

  return { workers: [worker], queues: [queue] };
};
