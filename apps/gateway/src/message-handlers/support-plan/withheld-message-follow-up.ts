import { db } from '@shopkeeper/db';
import { getLatestConversationMessage } from '@shopkeeper/agent/thread-auth';
import { buildContext } from '@shopkeeper/agent/build-context';
import { planAgent } from '@shopkeeper/agent/planner';
import { decideAutonomy } from '@shopkeeper/agent/autonomy';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { buildAgentPlanCacheRecord, commitThreadPlanCacheIfCurrent } from '@shopkeeper/agent/plan-cache';
import { getPendingCustomerMessageId } from '@shopkeeper/agent/plan-cache-shape';
import { supportAttemptSettlement } from '@shopkeeper/agent/plan-execution';
import { buildWithheldMessageFollowUpInstruction } from '@shopkeeper/agent/plan-failure-replan';
import {
  finishWithheldMessageFollowUp,
  settleAgentTaskClaim,
  type WithheldMessageFollowUp,
} from '@shopkeeper/agent/task-ledger';
import { hashInstruction, hashPlan } from '@shopkeeper/agent/agent-actions';
import type { TaskModelBudget } from '@shopkeeper/agent/context';
import type { OrgSettings } from '@shopkeeper/agent/types';
import { STATUS } from '../../constants.js';
import logger from '../../logger.js';
import { publishThreadEvent } from '../../realtime/publish.js';
import { toGatewayAgentPlan } from './agent-plan-adapter.js';
import { gatewayThreadSink } from './agent-thread-sink.js';
import {
  sendOperatorPlanNotification,
  sendOperatorQuestionNotification,
} from './planning-notifications.js';

export interface WithheldMessageFollowUpClaim {
  organizationId: string;
  taskId: string;
  threadId: string;
  objective: string;
  runtimeVersion: number;
  expectedRevision: number;
  claimToken: string;
  requestId: string;
  followUp: WithheldMessageFollowUp;
}

/**
 * The attempt that follows an approved message the executor withheld: draft what
 * actually happened, park it on the task for the merchant, and push the card to
 * every surface. It may only read and draft (`withheldMessageFollowUp`), and its
 * plan carries a blocking signal, so nothing it drafts is sent without approval.
 *
 * When there is nothing to draft against — the conversation closed, someone has
 * already answered the customer, or the customer wrote again — the task ends in
 * the outcome the approved execution had.
 */
export async function runWithheldMessageFollowUp(
  claim: WithheldMessageFollowUpClaim,
  taskBudget: TaskModelBudget,
): Promise<void> {
  const { organizationId, threadId, followUp } = claim;
  const ledgerClaim = {
    organizationId,
    taskId: claim.taskId,
    expectedRevision: claim.expectedRevision,
    claimToken: claim.claimToken,
  };
  const execution = await db.planExecution.findFirst({
    where: { id: followUp.executionId, organizationId, taskId: claim.taskId },
    select: { status: true, sourceMessageId: true },
  });
  const finish = () => finishWithheldMessageFollowUp({
    ...ledgerClaim,
    outcome: execution?.status === 'committed' ? 'completed' : 'failed',
  });

  const thread = await db.thread.findFirst({
    where: { id: threadId, organizationId, deletedAt: null, archivedAt: null },
    select: {
      status: true,
      channelType: true,
      requestSummary: true,
      customer: { select: { name: true } },
    },
  });
  const latest = thread?.status === STATUS.OPEN
    ? await getLatestConversationMessage(threadId, organizationId)
    : null;
  const sourceMessageId = latest ? getPendingCustomerMessageId([latest]) : null;
  // Only the message the approved plan answered. A newer one is its own
  // request, planned by its own job; drafting against it here would compete.
  if (!execution || !thread || !sourceMessageId || sourceMessageId !== execution.sourceMessageId) {
    await finish();
    return;
  }

  try {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = resolveAgentSettings(org?.settings as Partial<OrgSettings> | null);
    const actions = await db.agentAction.findMany({
      where: {
        organizationId,
        executionId: followUp.executionId,
        category: { notIn: ['communication', 'read'] },
      },
      orderBy: [{ actionIndex: 'asc' }, { executedAt: 'asc' }],
      select: { tool: true, status: true, output: true },
    });
    const instruction = buildWithheldMessageFollowUpInstruction({
      objective: claim.objective,
      reason: followUp.reason,
      actions,
    });

    const ctx = await buildContext(threadId, organizationId, gatewayThreadSink);
    ctx.taskBudget = taskBudget;
    const plan = await planAgent(ctx, instruction, settings, {
      exactDraftProposal: true,
      runtimeVersion: claim.runtimeVersion,
      withheldMessageFollowUp: true,
    });
    const cache = buildAgentPlanCacheRecord({
      instruction,
      lastCustomerMessageId: sourceMessageId,
      settings,
      plan,
    });
    const committed = await commitThreadPlanCacheIfCurrent({
      orgId: organizationId,
      threadId,
      sourceMessageId,
      cache,
    });
    if (!committed || !cache.planId) {
      await finish();
      return;
    }

    const verdict = decideAutonomy(plan, settings);
    const merchantQuestion = verdict.kind === 'needs_merchant_input' ? verdict.question : null;
    const settlement = await supportAttemptSettlement({
      orgId: organizationId,
      threadId,
      settings,
      merchantQuestion,
      sourceRequestIds: [claim.requestId],
    });
    const settled = settlement.status === 'completed'
      ? await finish()
      : await settleAgentTaskClaim({ ...ledgerClaim, requestId: claim.requestId, settlement });
    if (!settled) {
      logger.warn(
        { organizationId, threadId, taskId: claim.taskId },
        '[WithheldMessageFollowUp] Task claim was lost before settlement',
      );
      return;
    }

    await publishThreadEvent(organizationId, threadId);
    const notifyPlan = toGatewayAgentPlan(plan);
    if (!notifyPlan) return;
    const identity = {
      planId: cache.planId,
      sourceMessageId,
      planHash: hashPlan(plan),
      instructionHash: hashInstruction(instruction),
    };
    const customerName = thread.customer?.name ?? null;
    if (merchantQuestion) {
      await sendOperatorQuestionNotification(
        organizationId,
        threadId,
        customerName,
        thread.channelType,
        thread.requestSummary,
        merchantQuestion,
        instruction,
        { planId: identity.planId, sourceMessageId },
      );
      return;
    }
    await sendOperatorPlanNotification(
      organizationId,
      threadId,
      customerName,
      thread.channelType,
      thread.requestSummary,
      notifyPlan,
      instruction,
      { identity },
    );
  } catch (error) {
    // The approved execution is already recorded, and the dashboard shows the
    // customer was not told. A drafting failure must not leave the task claimed.
    logger.error(
      { err: error, opsAlert: true, organizationId, threadId, taskId: claim.taskId },
      '[WithheldMessageFollowUp] Could not draft the follow-up',
    );
    await finish().catch(() => undefined);
  }
}
