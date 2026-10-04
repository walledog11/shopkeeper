import { Worker } from 'bullmq';
import { db } from '@shopkeeper/db';
import {
  claimAgentTask,
  claimWithheldMessageFollowUp,
  failAgentTaskClaim,
  renewAgentTaskLease,
  settleAgentTaskClaim,
} from '@shopkeeper/agent/task-ledger';
import { taskModelBudget } from '@shopkeeper/agent/task-run';
import type { TaskSettlement } from '@shopkeeper/agent/task-ledger';
import { QUEUE } from '../constants.js';
import logger from '../logger.js';
import { getContext, loadLiveOperatorContext, normalizeApprovedToolCalls } from '../operator-context.js';
import { runOperatorFreeFormTurn } from '../message-handlers/operator/operator-free-form-turn.js';
import { runWithheldMessageFollowUp } from '../message-handlers/support-plan/withheld-message-follow-up.js';
import type { AgentTaskJobData } from '../types.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';
import { operatorBindingStillValid, operatorTaskMessage } from './operator-event.js';
import { completeOperatorTaskReply } from '../operator-event-reply.js';
import { notifyCommittedComposerTask, runComposerTask } from '../message-handlers/support-plan/composer-task.js';
import { OperatorNotifyError } from '../operator-notify.js';

const LEASE_MS = 300_000;
const RENEW_MS = 60_000;

// A support task whose approved message was withheld. Its approved writes ran,
// so `claimAgentTask` rightly refuses it; this claim admits it only when every
// write settled, and the attempt may only draft.
async function processWithheldMessageFollowUp(data: AgentTaskJobData): Promise<boolean> {
  const claimed = await claimWithheldMessageFollowUp({
    organizationId: data.organizationId,
    taskId: data.taskId,
    expectedRevision: data.revision,
    leaseMs: LEASE_MS,
  });
  if (!claimed) return false;
  const request = await db.agentRequest.findFirst({
    where: { organizationId: data.organizationId, taskId: data.taskId },
    orderBy: [{ acceptedAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  const claim = {
    organizationId: data.organizationId,
    taskId: data.taskId,
    expectedRevision: data.revision,
    claimToken: claimed.claimToken,
  };
  await runWithheldMessageFollowUp({
    ...claim,
    threadId: claimed.task.threadId,
    objective: claimed.task.objective,
    runtimeVersion: claimed.task.runtimeVersion,
    requestId: request?.id ?? data.taskId,
    followUp: claimed.followUp,
  }, taskModelBudget(claim));
  return true;
}

export async function processAgentTaskJob(data: AgentTaskJobData): Promise<void> {
  if (await processWithheldMessageFollowUp(data)) return;
  const claimed = await claimAgentTask({
    organizationId: data.organizationId,
    taskId: data.taskId,
    expectedRevision: data.revision,
    leaseMs: LEASE_MS,
  });
  if (!claimed) {
    await notifyCommittedComposerTask({
      organizationId: data.organizationId, taskId: data.taskId, expectedRevision: data.revision,
    });
    return;
  }

  // Newest first: a resumed task carries both the original instruction and the
  // answer that woke it, and the answer is what this attempt is running.
  const checkpoint = claimed.task.checkpoint;
  const planRequestId = checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint)
    && checkpoint.nextWork === 'ticket_plan' && typeof checkpoint.planRequestId === 'string'
    ? checkpoint.planRequestId : null;
  const request = await db.agentRequest.findFirst({
    where: { organizationId: data.organizationId, taskId: data.taskId, ...(planRequestId ? { id: planRequestId } : {}) },
    orderBy: [{ acceptedAt: 'desc' }, { id: 'desc' }],
  });
  const isComposer = request?.payload && typeof request.payload === 'object' && !Array.isArray(request.payload)
    && request.payload.kind === 'ticket_plan';
  const actorKey = isComposer ? request!.actorKey : claimed.task.initiatingActorKey;
  const memberId = actorKey.startsWith('member:')
    ? actorKey.slice('member:'.length)
    : null;
  const member = memberId
    ? await db.orgMember.findFirst({
        where: { id: memberId, organizationId: data.organizationId },
        select: { clerkUserId: true },
      })
    : null;
  const event = request?.sourceOperatorEventId
    ? await db.operatorEvent.findFirst({
        where: {
          id: request.sourceOperatorEventId, organizationId: data.organizationId,
          agentRequestId: request.id, clerkUserId: member?.clerkUserId,
        },
      })
    : null;

  if (
    !request || !member
    || (request.sourceOperatorEventId && (
      !event?.claimToken || event.status !== 'claimed'
      || !(await operatorBindingStillValid(event, event.claimToken))
    ))
  ) {
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
    await completeOperatorTaskReply({ organizationId: data.organizationId, taskId: data.taskId, requestId: request.id });
    return;
  }

  const claim = {
    organizationId: data.organizationId,
    taskId: data.taskId,
    expectedRevision: data.revision,
    claimToken: claimed.claimToken,
  };
  const taskBudget = taskModelBudget(claim);

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

  let summary: string | undefined;
  try {
    if (isComposer) {
      if (!request.sourceMessageId) throw new Error('Composer request has no customer message source.');
      await runComposerTask({
        ...claim, requestId: request.id, threadId: claimed.task.threadId,
        sourceMessageId: request.sourceMessageId, instruction: request.normalizedInstruction,
        runtimeVersion: claimed.task.runtimeVersion,
        assertExecutionAllowed: () => { if (leaseLost) throw new Error('Task lease ownership was lost.'); },
      }, taskBudget);
      return;
    }
    const memberKey = claimed.task.initiatingActorKey;
    const context = await loadLiveOperatorContext(
      data.organizationId,
      memberKey,
      await getContext(data.organizationId, memberKey),
    );
    const result = await runOperatorFreeFormTurn({
      organizationId: data.organizationId,
      clerkUserId: member.clerkUserId,
      requestId: request.id,
      taskId: data.taskId,
      taskAuthority: {
        kind: 'claim',
        taskId: data.taskId,
        expectedRevision: data.revision,
        claimToken: claimed.claimToken,
      },
      taskBudget,
      assertExecutionAllowed: () => {
        if (leaseLost) throw new Error('Task lease ownership was lost.');
      },
      message: event ? operatorTaskMessage(event, memberKey) : {
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
    // Ticket cards belong to their support tasks. A merchant's new instruction
    // must not copy another thread's waiting proposal onto its operator task.
    const question = after.pendingQuestion?.threadId === claimed.task.threadId ? after.pendingQuestion : null;
    const plan = after.pendingPlans.find((pending) => pending.threadId === claimed.task.threadId);
    const hasUnknownOutcome = result.actionsPerformed.some((action) => action.status === 'unknown');
    const settlement: TaskSettlement = hasUnknownOutcome
      ? { status: 'reconciling', failureCode: 'unknown_provider_outcome' }
      : question
        ? { status: 'waiting_input', question: question.question }
        : plan
          ? {
              status: 'waiting_approval',
              proposal: {
                // The parked card's plan ID becomes the proposal's ID, so an
                // approval from any surface names the exact durable snapshot.
                ...(plan.planId ? { proposalId: plan.planId } : {}),
                instruction: plan.instruction,
                rawToolCalls: normalizeApprovedToolCalls(plan.rawToolCalls),
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
    summary = result.summary;
  } catch (error) {
    // The composer already committed its card. BullMQ retries delivery against
    // that identity without another claim, model call or provider action.
    if (isComposer && error instanceof OperatorNotifyError) throw error;
    logger.error({ err: error, taskId: data.taskId, requestId: request.id }, '[AgentTask] Turn failed');
    await failAgentTaskClaim({
      ...claim,
      requestId: request.id,
      failureCode: leaseLost ? 'claim_lost' : 'turn_failed',
    });
  } finally {
    clearInterval(renewal);
  }
  await completeOperatorTaskReply({ organizationId: data.organizationId, taskId: data.taskId, requestId: request.id, summary });
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
