import type { RawToolCall } from '@shopkeeper/agent/types';
import { isPlanExecutionFailureMessage } from '@shopkeeper/agent/message-dispatch';
import { resolvePendingPlanContexts, type PendingPlan } from '../operator-context.js';
import type { ExpectedPlanIdentity } from '@shopkeeper/agent/plan-execution';
import { BadRequestError, ConflictError } from '@shopkeeper/agent/errors';
import { getPlanExecution } from '@shopkeeper/agent/execution-ledger';
import { executeOperatorApprovedCachedPlan } from './execute-operator-agent-turn.js';

// Runs an approved plan's stored tool calls verbatim on its ticket thread (zero
// model calls), then clears the parked plan. Shared by the keyword fast path
// (handlePendingPlanCommand) and the approve_pending_plan control tool so both
// approve identically. A throw propagates with the plan left parked — a failed
// run is not a dismissal.
export async function runApprovedPendingPlan(params: {
  organizationId: string;
  chatId: string;
  clerkUserId: string;
  threadId: string;
  instruction: string;
  approvedToolCalls: RawToolCall[];
  expectedIdentity?: ExpectedPlanIdentity;
  pendingPlan: PendingPlan;
}): Promise<string> {
  let summary: string;
  try {
    ({ summary } = await executeOperatorApprovedCachedPlan({
      orgId: params.organizationId,
      threadId: params.threadId,
      instruction: params.instruction,
      approvedToolCalls: params.approvedToolCalls,
      clerkUserId: params.clerkUserId,
      ...(params.expectedIdentity ? { expectedIdentity: params.expectedIdentity } : {}),
    }));
  } catch (error) {
    // A stable plan that is stale, already claimed, or terminal is no longer
    // actionable on any device. Unknown pre-claim infrastructure failures leave
    // it parked so the merchant can retry safely.
    const planId = params.pendingPlan.planId;
    const execution = planId
      ? await getPlanExecution(params.organizationId, planId).catch(() => null)
      : null;
    if (
      planId
      && (error instanceof ConflictError
        || error instanceof BadRequestError
        || (execution && execution.status !== 'pending'))
    ) {
      await resolvePendingPlanContexts(params.organizationId, params.chatId, params.pendingPlan);
    }
    throw error;
  }
  if (!isPlanExecutionFailureMessage(summary)) {
    await resolvePendingPlanContexts(params.organizationId, params.chatId, params.pendingPlan);
  }
  return summary || 'Done.';
}

// Dismisses a parked plan without running it. Shared by the keyword `no`/`dismiss`
// path and the reject_pending_plan control tool.
export async function clearPendingPlan(
  organizationId: string,
  chatId: string,
  expected: PendingPlan,
): Promise<void> {
  await resolvePendingPlanContexts(organizationId, chatId, expected);
}
