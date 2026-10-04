import { db } from '@shopkeeper/db';
import { buildContext } from '@shopkeeper/agent/build-context';
import { planAgent } from '@shopkeeper/agent/planner';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { requireOrgThread } from '@shopkeeper/agent/thread-auth';
import { buildAgentPlanCacheRecord, readAgentPlanCache } from '@shopkeeper/agent/plan-cache';
import { supportAttemptSettlement } from '@shopkeeper/agent/plan-execution';
import { settleAgentTaskClaim, type TaskClaimIdentity } from '@shopkeeper/agent/task-ledger';
import { captureCommittedPlanOutcome } from '@shopkeeper/agent/request-outcome';
import { hashInstruction, hashPlan } from '@shopkeeper/agent/agent-actions';
import type { TaskModelBudget } from '@shopkeeper/agent/context';
import { gatewayThreadSink } from './agent-thread-sink.js';
import { publishThreadEvent } from '../../realtime/publish.js';
import { toGatewayAgentPlan } from './agent-plan-adapter.js';
import { sendOperatorPlanNotification, sendOperatorQuestionNotification } from './planning-notifications.js';

/** Planning stays on the ticket and never executes the proposed writes. The
 * task worker owns the lease, budget, and stop boundary across disconnects. */
export async function runComposerTask(input: TaskClaimIdentity & {
  claimToken: string;
  requestId: string;
  threadId: string;
  sourceMessageId: string;
  instruction: string;
  runtimeVersion: number;
  assertExecutionAllowed: () => void;
}, budget: TaskModelBudget): Promise<void> {
  const thread = await requireOrgThread(input.threadId, input.organizationId);
  const org = await db.organization.findUniqueOrThrow({
    where: { id: input.organizationId }, select: { settings: true },
  });
  const settings = resolveAgentSettings(org.settings);
  const ctx = await buildContext(input.threadId, input.organizationId, gatewayThreadSink, { runtimeVersion: input.runtimeVersion });
  ctx.taskBudget = budget;
  ctx.agentRequestId = input.requestId;
  ctx.agentTaskId = input.taskId;
  ctx.assertExecutionAllowed = input.assertExecutionAllowed;
  const plan = await planAgent(ctx, input.instruction, settings, {
    merchantInstruction: true, runtimeVersion: input.runtimeVersion,

  });
  input.assertExecutionAllowed();
  const cache = buildAgentPlanCacheRecord({
    instruction: input.instruction, lastCustomerMessageId: input.sourceMessageId, settings, plan,
  });
  const question = plan.rawToolCalls.find(call => call.name === 'ask_operator')?.input;
  const merchantQuestion = question && typeof question === 'object' && 'question' in question && typeof question.question === 'string'
    ? question.question : null;
  const settlement = await supportAttemptSettlement({
    orgId: input.organizationId, threadId: input.threadId, settings,
    merchantQuestion, sourceRequestIds: [input.requestId], allowMutativeAutoExecute: false, manualReview: true,
    proposedCache: cache,
  });
  if (!(await settleAgentTaskClaim({
    ...input, settlement, planCache: { threadId: input.threadId, sourceMessageId: input.sourceMessageId, cache },
  }))) throw new Error('Planning task claim was lost before settlement.');
  await captureCommittedPlanOutcome({
    orgId: input.organizationId, thread, sourceMessageId: input.sourceMessageId,
    planId: cache.planId!, instruction: input.instruction, plan, settings, allowMutativeAutoExecute: false,
  });
  await publishThreadEvent(input.organizationId, input.threadId);
  await notifyCommittedComposerTask(input);
}

/** A delivery retry reads the committed card; it never claims or re-plans work. */
export async function notifyCommittedComposerTask(input: Pick<TaskClaimIdentity, 'organizationId' | 'taskId' | 'expectedRevision'>): Promise<void> {
  const task = await db.agentTask.findFirst({
    where: {
      id: input.taskId, organizationId: input.organizationId, revision: input.expectedRevision,
      status: { in: ['waiting_approval', 'waiting_input'] }, cancelledAt: null,
      thread: { deletedAt: null, archivedAt: null, channelType: { not: 'operator' }, organization: { lifecycleStatus: 'active' } },
    },
    select: {
      threadId: true, status: true, activeProposalId: true, pendingQuestion: true, pendingAnswererKind: true,
      thread: { select: {
        cachedPlan: true, cachedPlanMessageId: true, channelType: true, requestSummary: true,
        customer: { select: { name: true } },
      } },
      requests: { orderBy: [{ acceptedAt: 'desc' }, { id: 'desc' }], take: 1,
        select: { actorKind: true, actorKey: true, sourceMessageId: true, payload: true, normalizedInstruction: true } },
    },
  });
  const request = task?.requests[0];
  if (!task || !request || request.actorKind !== 'member' || !request.sourceMessageId
    || !request.payload || typeof request.payload !== 'object' || Array.isArray(request.payload)
    || request.payload.kind !== 'ticket_plan' || !request.actorKey.startsWith('member:')) return;
  const member = await db.orgMember.findFirst({
    where: { id: request.actorKey.slice('member:'.length), organizationId: input.organizationId }, select: { id: true },
  });
  const cache = readAgentPlanCache(task.thread.cachedPlan);
  if (!member || !cache?.planId || cache.lastCustomerMessageId !== request.sourceMessageId
    || task.thread.cachedPlanMessageId !== request.sourceMessageId
    || cache.instruction !== request.normalizedInstruction
    || (task.status === 'waiting_approval' && task.activeProposalId !== cache.planId)) return;
  const notificationPlan = toGatewayAgentPlan(cache.plan);
  if (!notificationPlan || cache.plan.steps.length === 0) return;
  if (task.status === 'waiting_input') {
    if (!task.pendingQuestion || task.pendingAnswererKind !== 'member') return;
    await sendOperatorQuestionNotification(
      input.organizationId, task.threadId, task.thread.customer.name, task.thread.channelType,
      task.thread.requestSummary, task.pendingQuestion, cache.instruction,
      { planId: cache.planId, sourceMessageId: request.sourceMessageId },
    );
  } else {
    await sendOperatorPlanNotification(
      input.organizationId, task.threadId, task.thread.customer.name, task.thread.channelType,
      task.thread.requestSummary, notificationPlan, cache.instruction,
      { identity: {
        planId: cache.planId, sourceMessageId: request.sourceMessageId,
        planHash: hashPlan(cache.plan), instructionHash: hashInstruction(cache.instruction),
      } },
    );
  }
}
