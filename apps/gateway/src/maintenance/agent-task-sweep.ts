import {
  findQueuedAgentTasks,
  reconcileExpiredAgentTaskClaims,
} from '@shopkeeper/agent/task-ledger';
import { JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import { ensureAgentTaskEnqueued } from '../agent-task-ingest.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

const SWEEP_INTERVAL_MS = 60_000;

export async function runAgentTaskSweep(): Promise<void> {
  const reconciled = await reconcileExpiredAgentTaskClaims();
  const queued = await findQueuedAgentTasks(100);
  const results = await Promise.allSettled(queued.map(task => ensureAgentTaskEnqueued(task)));
  const enqueueFailures = results.filter((result) => result.status === 'rejected');
  if (reconciled > 0 || enqueueFailures.length > 0) {
    logger.error({
      opsAlert: true,
      reconciled,
      queuedFound: queued.length,
      enqueueFailures: enqueueFailures.length,
    }, '[AgentTaskSweep] Durable task recovery needs attention');
  }
}

export const registerAgentTaskSweepMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.AGENT_TASK_SWEEP);
  await scheduleRepeatableJob(
    queue,
    JOB.AGENT_TASK_SWEEP,
    JOB.AGENT_TASK_SWEEP_ID,
    SWEEP_INTERVAL_MS,
  );
  const worker = createMaintenanceWorker(context, QUEUE.AGENT_TASK_SWEEP, runAgentTaskSweep, {
    label: 'AgentTaskSweep',
    failureQueue: 'agent-task-sweep',
  });
  return { workers: [worker], queues: [queue] };
};
