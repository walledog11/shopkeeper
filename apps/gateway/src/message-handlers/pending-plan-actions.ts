import type { RawToolCall } from '@shopkeeper/agent/types';
import { updateContext } from '../operator-context.js';
import { executeOperatorAgentTurn } from './execute-operator-agent-turn.js';

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
}): Promise<string> {
  const { summary } = await executeOperatorAgentTurn({
    orgId: params.organizationId,
    threadId: params.threadId,
    instruction: params.instruction,
    approvedToolCalls: params.approvedToolCalls,
    clerkUserId: params.clerkUserId,
  });
  await updateContext(params.organizationId, params.chatId, { pendingPlan: null });
  return summary || 'Done.';
}

// Dismisses a parked plan without running it. Shared by the keyword `no`/`dismiss`
// path and the reject_pending_plan control tool.
export async function clearPendingPlan(organizationId: string, chatId: string): Promise<void> {
  await updateContext(organizationId, chatId, { pendingPlan: null });
}
