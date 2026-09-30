import { db } from '@shopkeeper/db';
import { buildContext } from '@shopkeeper/agent/build-context';
import { planAgent, usesExactDraftProposals } from '@shopkeeper/agent/planner';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { requireOrgThread } from '@shopkeeper/agent/thread-auth';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { supportAttemptSettlement } from '@shopkeeper/agent/plan-execution';
import { settleAgentTaskClaim, type TaskClaimIdentity } from '@shopkeeper/agent/task-ledger';
import { captureCommittedPlanOutcome } from '@shopkeeper/agent/request-outcome';
import type { TaskModelBudget } from '@shopkeeper/agent/context';
import { gatewayThreadSink } from './agent-thread-sink.js';
import { publishThreadEvent } from '../../realtime/publish.js';

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
    ...(usesExactDraftProposals(input.runtimeVersion) ? { exactDraftProposal: true } : {}),
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
}
