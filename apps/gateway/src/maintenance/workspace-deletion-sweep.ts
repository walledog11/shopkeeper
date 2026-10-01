import { claimWorkspaceDeletion, listRecoverableWorkspaceDeletions, releaseWorkspaceDeletion } from '@shopkeeper/db';
import { postDashboardInternal } from '../clients/dashboard-internal.js';
import logger from '../logger.js';
import { createMaintenanceQueue, createMaintenanceWorker, scheduleRepeatableJob, type MaintenanceJobRegistration } from './registration.js';

async function recoverWorkspaceDeletions(): Promise<void> {
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
      await releaseWorkspaceDeletion(operation.id, claimed.claimToken, error);
      logger.error({ err: error, operationId: operation.id, opsAlert: true }, '[WorkspaceDeletion] Cleanup needs retry');
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
