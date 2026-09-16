import { Worker } from 'bullmq';
import { db } from '@shopkeeper/db';
import {
  claimAgentTask,
  failAgentTaskClaim,
  recordAgentTaskModelUsage,
  renewAgentTaskLease,
  reserveAgentTaskModelCall,
  settleAgentTaskClaim,
} from '@shopkeeper/agent/task-ledger';
import { estimateModelUsageCostUsd, UnknownModelPriceError } from '@shopkeeper/agent/model-cost';
import type { TaskSettlement } from '@shopkeeper/agent/task-ledger';
import type { TaskModelBudget } from '@shopkeeper/agent/context';
import { QUEUE } from '../constants.js';
import logger from '../logger.js';
import { getContext, loadLiveOperatorContext, normalizeApprovedToolCalls } from '../operator-context.js';
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

  const claim = {
    organizationId: data.organizationId,
    taskId: data.taskId,
    expectedRevision: data.revision,
    claimToken: claimed.claimToken,
  };
  // Reserved before the provider is contacted and charged as soon as the
  // response is measured, so a crash costs at most one call's accounting and
  // never returns the task to a fresh allowance.
  const taskBudget: TaskModelBudget = {
    reserveModelCall: async () => {
      const state = await reserveAgentTaskModelCall(claim);
      if (state !== 'active') throw new Error(`Task stopped: ${state}.`);
    },
    recordModelUsage: async (usage, model) => {
      let spentNanoUsd = 0n;
      try {
        spentNanoUsd = BigInt(Math.ceil(estimateModelUsageCostUsd(model, usage) * 1_000_000_000));
      } catch (error) {
        if (!(error instanceof UnknownModelPriceError)) throw error;
        logger.warn({ model, taskId: data.taskId }, '[AgentTask] Unpriced model; call counted without spend');
      }
      await recordAgentTaskModelUsage({
        ...claim,
        usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, spentNanoUsd },
      });
    },
  };

  let leaseLost = false;
  const renewal = setInterval(() => {
    void renewAgentTaskLease({ ...claim, leaseMs: LEASE_MS }).then((renewed) => {
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
      taskBudget,
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

    const after = await getContext(data.organizationId, memberKey);
    // The parked queue is the merchant-facing projection; the task records the
    // same wait durably, so a trimmed card cannot lose what was asked.
    const settlement: TaskSettlement = after.pendingQuestion
      ? { status: 'waiting_input', question: after.pendingQuestion.question }
      : after.pendingPlan
        ? {
            status: 'waiting_approval',
            proposal: {
              // The parked card's plan ID becomes the proposal's ID, so an
              // approval from any surface names the exact durable snapshot.
              ...(after.pendingPlan.planId ? { proposalId: after.pendingPlan.planId } : {}),
              instruction: after.pendingPlan.instruction,
              rawToolCalls: normalizeApprovedToolCalls(after.pendingPlan.rawToolCalls),
              sourceRequestIds: [request.id],
            },
          }
        : { status: 'completed' };
    const settled = await settleAgentTaskClaim({
      ...claim,
      requestId: request.id,
      settlement,
    });
    if (!settled) throw new Error('Task claim was lost before its result could be recorded.');
  } catch (error) {
    logger.error({ err: error, taskId: data.taskId, requestId: request.id }, '[AgentTask] Turn failed');
    await failAgentTaskClaim({
      ...claim,
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
