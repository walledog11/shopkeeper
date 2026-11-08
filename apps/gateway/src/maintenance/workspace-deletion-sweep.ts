import {
  claimWorkspaceDeletion,
  failWorkspaceDeletion,
  listRecoverableWorkspaceDeletions,
  releaseWorkspaceDeletion,
} from '@shopkeeper/db';
import { postDashboardInternal } from '../clients/dashboard-internal.js';
import { emitOpsAlert } from '../ops-alerts.js';
import { createMaintenanceQueue, createMaintenanceWorker, scheduleRepeatableJob, type MaintenanceJobRegistration } from './registration.js';

// About a day of one-minute sweeps. Past it, a deletion that still fails is
// marked failed and reported once, instead of retrying every minute forever.
// Attempts that only made progress count too, so this sits far above what even
// a large workspace's cleanup takes.
export const WORKSPACE_DELETION_MAX_ATTEMPTS = 24 * 60;

export async function recoverWorkspaceDeletions(): Promise<void> {
  const operations = await listRecoverableWorkspaceDeletions({ limit: 10 });
  for (const operation of operations) {
    const claimed = await claimWorkspaceDeletion(operation.id);
    if (!claimed) continue;
    try {
      const result = await postDashboardInternal<{ completed: boolean }>(
        '/api/org/internal/delete', { operationId: operation.id, claimToken: claimed.claimToken },
        { requestId: operation.id },
      );
      if (!result.ok) throw new Error(`Workspace cleanup failed: ${result.status ?? result.outcome}`);
      if (!result.data.completed) {
        await releaseWorkspaceDeletion(operation.id, claimed.claimToken, 'Cleanup will continue on the next sweep');
      }
    } catch (error) {
      const extra = {
        operationId: operation.id,
        organizationId: operation.organizationId,
        attempts: claimed.operation.attempts,
        err: error instanceof Error ? error.message : String(error),
      };
      if (claimed.operation.attempts >= WORKSPACE_DELETION_MAX_ATTEMPTS) {
        await failWorkspaceDeletion(operation.id, claimed.claimToken, error);
        emitOpsAlert({
          category: 'data_deletion',
          level: 'error',
          message: '[WorkspaceDeletion] Cleanup still failing after a day; stopped retrying',
          fingerprint: ['ops-alert', 'data_deletion', 'gateway', `workspace_deletion_failed:${operation.id}`],
          extra,
        });
        continue;
      }
      await releaseWorkspaceDeletion(operation.id, claimed.claimToken, error);
      emitOpsAlert({
        category: 'data_deletion',
        level: 'error',
        message: '[WorkspaceDeletion] Cleanup needs retry',
        fingerprint: ['ops-alert', 'data_deletion', 'gateway', `workspace_deletion:${operation.id}`],
        extra,
      }, { pushOncePerSecs: 24 * 60 * 60 });
    }
  }
}

export const registerWorkspaceDeletionSweepMaintenanceJob: MaintenanceJobRegistration = async context => {
  const queueName = 'workspace-deletion-sweep';
  const queue = createMaintenanceQueue(context, queueName);
  await scheduleRepeatableJob(queue, 'recover-workspace-deletions', 'workspace-deletion-sweep-1min', 60_000);
  const worker = createMaintenanceWorker(context, queueName, recoverWorkspaceDeletions,
    { label: 'WorkspaceDeletion', failureQueue: queueName });
  return { workers: [worker], queues: [queue] };
};
