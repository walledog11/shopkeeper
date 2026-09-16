import { Worker } from 'bullmq';
import { db } from '@shopkeeper/db';
import {
  claimAgentTask,
  failAgentTaskClaim,
  renewAgentTaskLease,
  settleAgentTaskClaim,
} from '@shopkeeper/agent/task-ledger';
import { estimateModelUsageCostUsd } from '@shopkeeper/agent/model-cost';
import { QUEUE } from '../constants.js';
import logger from '../logger.js';
import { getContext, loadLiveOperatorContext } from '../operator-context.js';
import { runOperatorFreeFormTurn } from '../message-handlers/operator-free-form-turn.js';
import type { AgentTaskJobData } from '../types.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

const LEASE_MS = 300_000;
const RENEW_MS = 60_000;

export async function processAgentTaskJob(data: AgentTaskJobData): Promise<void> {
  const claimed = await claimAgentTask({
    organizationId: data.organizationId,
    taskId: data.taskId,
    expectedRevision: data.revision,
    leaseMs: LEASE_MS,
  });
  if (!claimed) return;

  const request = await db.agentRequest.findFirst({
    where: { organizationId: data.organizationId, taskId: data.taskId },
    orderBy: [{ acceptedAt: 'asc' }, { id: 'asc' }],
  });
  const memberId = claimed.task.initiatingActorKey.startsWith('member:')
    ? claimed.task.initiatingActorKey.slice('member:'.length)
    : null;
  const member = memberId
    ? await db.orgMember.findFirst({
        where: { id: memberId, organizationId: data.organizationId },
        select: { clerkUserId: true },
      })
    : null;

  if (!request || !member) {
    await failAgentTaskClaim({
      organizationId: data.organizationId,
      taskId: data.taskId,
      expectedRevision: data.revision,
      claimToken: claimed.claimToken,
      requestId: request?.id ?? data.taskId,
      failureCode: 'invalid_task_owner',
    });
    return;
  }

  if (
    claimed.task.modelCallsUsed >= claimed.task.modelCallLimit
    || claimed.task.activeTimeMsUsed >= claimed.task.activeTimeMsLimit
    || claimed.task.spentNanoUsd >= claimed.task.spendNanoUsdLimit
  ) {
    await failAgentTaskClaim({
      organizationId: data.organizationId,
      taskId: data.taskId,
      expectedRevision: data.revision,
      claimToken: claimed.claimToken,
      requestId: request.id,
      failureCode: 'task_budget_exhausted',
    });
    return;
  }

  let leaseLost = false;
  const renewal = setInterval(() => {
    void renewAgentTaskLease({
      organizationId: data.organizationId,
      taskId: data.taskId,
      expectedRevision: data.revision,
      claimToken: claimed.claimToken,
      leaseMs: LEASE_MS,
    }).then((renewed) => {
      if (!renewed) leaseLost = true;
    }).catch((error: unknown) => {
      leaseLost = true;
      logger.error({ err: error, taskId: data.taskId }, '[AgentTask] Lease renewal failed');
    });
  }, RENEW_MS);
  renewal.unref();

  try {
    const memberKey = claimed.task.initiatingActorKey;
    const context = await loadLiveOperatorContext(
      data.organizationId,
      memberKey,
      await getContext(data.organizationId, memberKey),
    );
    await runOperatorFreeFormTurn({
      organizationId: data.organizationId,
      clerkUserId: member.clerkUserId,
      requestId: request.id,
      taskId: data.taskId,
      assertExecutionAllowed: () => {
        if (leaseLost) throw new Error('Task lease ownership was lost.');
      },
      message: {
        chatId: memberKey,
        body: request.normalizedInstruction,
        senderRef: memberKey,
        reply: async () => {},
        presence: (_progress, work) => work(),
      },
      context,
    });
    if (leaseLost) throw new Error('Task lease ownership was lost before completion.');

    const [after, usage] = await Promise.all([
      getContext(data.organizationId, memberKey),
      db.agentTurnUsage.findUnique({ where: { turnId: request.id } }),
    ]);
    const taskStatus = after.pendingQuestion
      ? 'waiting_input' as const
      : after.pendingPlans.length > 0
        ? 'waiting_approval' as const
        : 'completed' as const;
    const spentNanoUsd = usage
      ? BigInt(Math.ceil(estimateModelUsageCostUsd('claude-sonnet-5', usage) * 1_000_000_000))
      : 0n;
    const settled = await settleAgentTaskClaim({
      organizationId: data.organizationId,
      taskId: data.taskId,
      expectedRevision: data.revision,
      claimToken: claimed.claimToken,
      requestId: request.id,
      status: taskStatus,
      ...(usage ? {
        usage: {
          modelCalls: usage.modelCalls,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          activeTimeMs: usage.durationMs,
          spentNanoUsd,
        },
      } : {}),
    });
    if (!settled) throw new Error('Task claim was lost before its result could be recorded.');
  } catch (error) {
    logger.error({ err: error, taskId: data.taskId, requestId: request.id }, '[AgentTask] Turn failed');
    await failAgentTaskClaim({
      organizationId: data.organizationId,
      taskId: data.taskId,
      expectedRevision: data.revision,
      claimToken: claimed.claimToken,
      requestId: request.id,
      failureCode: leaseLost ? 'claim_lost' : 'turn_failed',
    });
  } finally {
    clearInterval(renewal);
  }
}

export function createAgentTaskWorker(options: { workerOptions: SharedGatewayWorkerOptions }) {
  const worker = new Worker<AgentTaskJobData>(
    QUEUE.AGENT_TASK,
    async (job) => processAgentTaskJob(job.data),
    { ...options.workerOptions, concurrency: 4 },
  );
  registerJobFailureLogging(worker, {
    logMessage: '[AgentTask] Job failed permanently',
    logFields: (job) => ({ jobId: job?.id }),
    failureExtra: (job) => ({
      opsAlert: true,
      queue: QUEUE.AGENT_TASK,
      taskId: job?.data?.taskId,
      organizationId: job?.data?.organizationId,
      attemptsMade: job?.attemptsMade,
    }),
  });
  return worker;
}
