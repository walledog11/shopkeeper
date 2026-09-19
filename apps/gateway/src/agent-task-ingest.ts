import { getGatewayBullMqQueue } from './clients/gateway-queues.js';
import { JOB, QUEUE } from './constants.js';
import type { AgentTaskJobData } from './types.js';

export async function ensureAgentTaskEnqueued(task: {
  id: string;
  organizationId: string;
  revision: number;
}): Promise<void> {
  const queue = getGatewayBullMqQueue(QUEUE.AGENT_TASK);
  const data: AgentTaskJobData = {
    taskId: task.id,
    organizationId: task.organizationId,
    revision: task.revision,
  };
  const existing = await queue.getJob(task.id);
  if (existing) {
    const state = await existing.getState();
    if (state === 'failed' || state === 'completed') {
      await existing.remove();
      await queue.add(JOB.AGENT_TASK, data, { jobId: task.id });
    }
    return;
  }
  await queue.add(JOB.AGENT_TASK, data, { jobId: task.id });
}
