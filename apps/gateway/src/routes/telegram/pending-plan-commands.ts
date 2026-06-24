import type { RawToolCall } from '@shopkeeper/agent/types';
import { READ_TOOLS } from '../../constants.js';
import logger from '../../logger.js';
import {
  extractOrderNumber,
  updateContext,
  type OperatorContext,
  type ToolCall,
} from '../../operator-context.js';
import { executeOperatorAgentTurn } from '../../message-handlers/execute-operator-agent-turn.js';
import type { PendingPlanCommand } from './command-parser.js';
import type { OperatorMessageContext } from '../operator-message.js';

function normalizeApprovedToolCalls(toolCalls: ToolCall[]): RawToolCall[] {
  return toolCalls.map((toolCall) => {
    const { id, name, input, ...rest } = toolCall;
    return {
      id,
      name,
      input: input !== undefined ? input : (Object.keys(rest).length > 0 ? rest : undefined),
    };
  });
}

export async function handlePendingPlanCommand(
  organizationId: string,
  clerkUserId: string,
  message: OperatorMessageContext,
  command: PendingPlanCommand,
  context: OperatorContext,
): Promise<boolean> {
  const { chatId, body, reply, presence } = message;
  if (!context.pendingPlan) return false;

  const { threadId, instruction, rawToolCalls } = context.pendingPlan;
  if (command.type === 'plan-dismiss') {
    await updateContext(organizationId, chatId, { pendingPlan: null });
    await reply('Plan dismissed.');
    return true;
  }

  let approvedToolCalls: ToolCall[] = rawToolCalls;
  if (command.type === 'plan-skip') {
    const actionable = rawToolCalls.filter((toolCall) => !READ_TOOLS.has(toolCall.name));
    const toSkip = actionable[command.index - 1];
    approvedToolCalls = toSkip
      ? rawToolCalls.filter((toolCall) => toolCall.id !== toSkip.id)
      : rawToolCalls;
  }

  logger.info({ chatId, threadId, toolCallCount: approvedToolCalls.length }, '[Operator] Approving plan');

  let summary: string;
  try {
    ({ summary } = await presence(
      {
        kind: 'plan-run',
        orderNumber: extractOrderNumber(instruction),
        instruction,
      },
      () => executeOperatorAgentTurn({
        orgId: organizationId,
        threadId,
        instruction,
        approvedToolCalls: normalizeApprovedToolCalls(approvedToolCalls),
        clerkUserId,
      }),
    ));
  } catch (err) {
    logger.error({ err }, '[Operator] Operator agent turn failed (plan approval)');
    await reply('Something went wrong running the plan. Please try again.');
    return true;
  }
  await updateContext(organizationId, chatId, {
    pendingPlan: null,
    lastThreadId: threadId,
    history: [
      ...context.history,
      { role: 'user', content: body },
      { role: 'assistant', content: summary },
    ],
  });

  await reply(summary || 'Done.');
  return true;
}
