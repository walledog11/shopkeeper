import { isReadToolName } from '@shopkeeper/agent/tools';
import logger from '../../logger.js';
import {
  extractOrderNumber,
  expectedPlanIdentity,
  normalizeApprovedToolCalls,
  type OperatorContext,
  type ToolCall,
} from '../../operator-context.js';
import { runApprovedPendingPlan, clearPendingPlan } from '../../message-handlers/pending-plan-actions.js';
import { refreshSkippedPlanTerminalSend } from '../../message-handlers/skipped-plan-terminal-send.js';
import { findTerminalSendTool } from '@shopkeeper/agent/planner-skip-reply';
import type { PendingPlanCommand } from './command-parser.js';
import type { OperatorMessageContext } from '../operator-message.js';

export async function handlePendingPlanCommand(
  organizationId: string,
  clerkUserId: string,
  message: OperatorMessageContext,
  command: PendingPlanCommand,
  context: OperatorContext,
): Promise<boolean> {
  const { chatId, reply, presence } = message;
  const pendingPlan = context.pendingPlan;
  if (!pendingPlan) return false;

  const { threadId, instruction, rawToolCalls } = pendingPlan;
  if (command.type === 'plan-dismiss') {
    await clearPendingPlan(organizationId, chatId, pendingPlan);
    // Older parked plans carry no actionLabel.
    await reply(pendingPlan.actionLabel ? `Dismissed — I won't ${pendingPlan.actionLabel}.` : 'Plan dismissed.');
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

  await reply(summary);
  return true;
}
