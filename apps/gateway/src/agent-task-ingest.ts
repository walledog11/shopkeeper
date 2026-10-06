import { getGatewayBullMqQueue } from './clients/gateway-queues.js';
import { JOB, QUEUE } from './constants.js';
import logger from './logger.js';
import { removePendingPlanForThread } from './operator-context.js';
import type { AgentTaskJobData } from './types.js';
import { DURABLE_AGENT_RUNTIME_VERSION } from '@shopkeeper/agent/runtime-modes';
import { acceptTicketAgentRequest } from '@shopkeeper/agent/task-ledger';

export function memberAgentTaskBudget() {
  return {
    runtimeVersion: DURABLE_AGENT_RUNTIME_VERSION,
    modelCallLimit: 20,
    activeTimeMsLimit: 120_000,
    spendNanoUsdLimit: 1_000_000_000n,
  };
}

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

/** A member's instruction to draft a ticket's plan: accepted on the ledger, the
 * ticket's superseded card withdrawn, and the composer task queued. The task
 * publishes the draft to the merchant's devices when it settles. */
export async function submitTicketPlanRequest(input: {
  organizationId: string;
  clerkUserId: string;
  threadId: string;
  dedupeKey: string;
  instruction: string;
  force: boolean;
}) {
  const accepted = await acceptTicketAgentRequest({ ...input, budget: memberAgentTaskBudget() });
  if (!accepted.deduplicated) await removePendingPlanForThread(input.organizationId, input.threadId);
  try {
    if (accepted.task.status === 'queued') await ensureAgentTaskEnqueued(accepted.task);
  } catch (error) {
    // The persisted queued task is authoritative; the recovery sweep enqueues it.
    logger.error({ err: error, taskId: accepted.task.id }, '[AgentTaskIngest] Composer enqueue failed; sweep will recover');
  }
  return accepted;
}
