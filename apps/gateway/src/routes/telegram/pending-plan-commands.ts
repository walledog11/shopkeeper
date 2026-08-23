import { isReadToolName } from '@shopkeeper/agent/tools';
import logger from '../../logger.js';
import {
  extractOrderNumber,
  expectedPlanIdentity,
  isPendingPlanInvalid,
  mostRecentPendingPlan,
  normalizeApprovedToolCalls,
  type OperatorContext,
  type PendingPlan,
  type ToolCall,
} from '../../operator-context.js';
import { runApprovedPendingPlan, clearPendingPlan } from '../../message-handlers/pending-plan-actions.js';
import { formatOperatorDispatchFailure, isPlanExecutionFailureMessage } from '@shopkeeper/agent/message-dispatch';
import { ConflictError } from '@shopkeeper/agent/errors';
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
  const { chatId, senderRef: memberKey, reply, presence } = message;
  const pendingPlan = mostRecentPendingPlan(context.pendingPlans);
  if (!pendingPlan) return false;
  // Everything but the most-recent plan stays parked; name it in the reply.
  const remaining = context.pendingPlans.slice(0, -1);

  const { threadId, instruction, rawToolCalls } = pendingPlan;
  if (command.type === 'plan-dismiss') {
    try {
      const dismissed = await clearPendingPlan(organizationId, memberKey, pendingPlan);
      if (!dismissed) {
        await reply(`That plan was already replaced or resolved.${stillWaitingSuffix(remaining)}`);
        return true;
      }
    } catch (error) {
      if (error instanceof ConflictError) {
        await reply("That plan is already running or completed, so it can't be dismissed.");
        return true;
      }
      throw error;
    }
    // Older parked plans carry no actionLabel.
    const dismissed = pendingPlan.actionLabel ? `Dismissed — I won't ${pendingPlan.actionLabel}.` : 'Plan dismissed.';
    await reply(`${dismissed}${stillWaitingSuffix(remaining)}`);
    return true;
  }

  if (isPendingPlanInvalid(pendingPlan)) {
    await reply("This draft failed validation, so I can't run or partially run it. Tell me what to change, or reply no to dismiss it.");
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

  const approvedRawToolCalls = normalizeApprovedToolCalls(approvedToolCalls);
  if (command.type === 'plan-skip' && skippedActionableTool && findTerminalSendTool(approvedRawToolCalls)) {
    // A redrafted terminal reply is a new proposal and cannot satisfy the
    // cached plan's exact-call membership guard. Keep the original plan parked
    // and send the merchant through the normal revise/re-plan path.
    logger.info({ chatId, threadId }, '[Operator] Skip requires a revised terminal reply — plan not run');
    await reply(
      "Skipping that step would change the customer reply, so I've run nothing. Tell me what to change and I'll draft a new plan, or reply no to dismiss this one.",
    );
    return true;
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
        memberKey,
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
