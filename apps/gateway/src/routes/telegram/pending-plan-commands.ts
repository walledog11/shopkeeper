import { isReadToolName } from '@shopkeeper/agent/tools';
import logger from '../../logger.js';
import {
  extractOrderNumber,
  expectedPlanIdentity,
  mostRecentPendingPlan,
  normalizeApprovedToolCalls,
  type OperatorContext,
  type PendingPlan,
  type ToolCall,
} from '../../operator-context.js';
import { runApprovedPendingPlan, clearPendingPlan } from '../../message-handlers/pending-plan-actions.js';
import { formatOperatorDispatchFailure, isPlanExecutionFailureMessage } from '@shopkeeper/agent/message-dispatch';
import { refreshSkippedPlanTerminalSend } from '../../message-handlers/skipped-plan-terminal-send.js';
import { findTerminalSendTool } from '@shopkeeper/agent/planner-skip-reply';
import type { PendingPlanCommand } from './command-parser.js';
import type { OperatorMessageContext } from '../operator-message.js';

// A literal yes/no/skip acts on the most-recent plan; any older queued plans stay
// pending. Names one so the merchant knows something's still waiting for them.
function stillWaitingSuffix(remaining: PendingPlan[]): string {
  if (remaining.length === 0) return '';
  if (remaining.length === 1) {
    const plan = remaining[0]!;
    const who = plan.customerName ? plan.customerName.split(' ')[0] : 'another customer';
    return plan.actionLabel
      ? `\n(${who}'s plan is still waiting — I'd ${plan.actionLabel}.)`
      : `\n(${who}'s plan is still waiting.)`;
  }
  return `\n(${remaining.length} more plans are still waiting for you.)`;
}

export async function handlePendingPlanCommand(
  organizationId: string,
  clerkUserId: string,
  message: OperatorMessageContext,
  command: PendingPlanCommand,
  context: OperatorContext,
): Promise<boolean> {
  const { chatId, reply, presence } = message;
  const pendingPlan = mostRecentPendingPlan(context.pendingPlans);
  if (!pendingPlan) return false;
  // Everything but the most-recent plan stays parked; name it in the reply.
  const remaining = context.pendingPlans.slice(0, -1);

  const { threadId, instruction, rawToolCalls } = pendingPlan;
  if (command.type === 'plan-dismiss') {
    await clearPendingPlan(organizationId, chatId, pendingPlan);
    // Older parked plans carry no actionLabel.
    const dismissed = pendingPlan.actionLabel ? `Dismissed — I won't ${pendingPlan.actionLabel}.` : 'Plan dismissed.';
    await reply(`${dismissed}${stillWaitingSuffix(remaining)}`);
    return true;
  }

  let approvedToolCalls: ToolCall[] = rawToolCalls;
  let skippedActionableTool: ToolCall | undefined;
  if (command.type === 'plan-skip') {
    const actionable = rawToolCalls.filter((toolCall) => !isReadToolName(toolCall.name));
    skippedActionableTool = actionable[command.index - 1];
    approvedToolCalls = skippedActionableTool
      ? rawToolCalls.filter((toolCall) => toolCall.id !== skippedActionableTool!.id)
      : rawToolCalls;
  }

  let approvedRawToolCalls = normalizeApprovedToolCalls(approvedToolCalls);
  if (command.type === 'plan-skip' && skippedActionableTool && findTerminalSendTool(approvedRawToolCalls)) {
    approvedRawToolCalls = await refreshSkippedPlanTerminalSend(
      organizationId,
      threadId,
      instruction,
      approvedRawToolCalls,
    );
  }

  logger.info({ chatId, threadId, toolCallCount: approvedRawToolCalls.length }, '[Operator] Approving plan');

  let summary: string;
  try {
    summary = await presence(
      {
        kind: 'plan-run',
        orderNumber: extractOrderNumber(instruction),
        instruction,
      },
      () => runApprovedPendingPlan({
        organizationId,
        chatId,
        clerkUserId,
        threadId,
        instruction,
        approvedToolCalls: approvedRawToolCalls,
        ...(expectedPlanIdentity(pendingPlan) ? { expectedIdentity: expectedPlanIdentity(pendingPlan) } : {}),
        pendingPlan,
      }),
    );
  } catch (err) {
    logger.error({ err }, '[Operator] Operator agent turn failed (plan approval)');
    await reply('Something went wrong running the plan. Please try again.');
    return true;
  }

  if (isPlanExecutionFailureMessage(summary)) {
    await reply(formatOperatorDispatchFailure(summary));
    return true;
  }
  await reply(`${summary}${stillWaitingSuffix(remaining)}`);
  return true;
}
