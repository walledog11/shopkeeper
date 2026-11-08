import {
  findQueuedAgentTasks,
  reconcileExpiredAgentTaskClaims,
} from '@shopkeeper/agent/task-ledger';
import { JOB, QUEUE } from '../constants.js';
import { emitOpsAlert } from '../ops-alerts.js';
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
    emitOpsAlert({
      category: 'queue_health',
      level: 'error',
      message: '[AgentTaskSweep] Durable task recovery needs attention',
      tags: { queue: QUEUE.AGENT_TASK },
      fingerprint: ['ops-alert', 'queue_health', 'gateway', 'source:agent_task_sweep'],
      extra: { reconciled, queuedFound: queued.length, enqueueFailures: enqueueFailures.length },
    }, { pushOncePerSecs: 60 * 60 });
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
