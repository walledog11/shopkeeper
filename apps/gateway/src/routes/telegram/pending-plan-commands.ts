import { getGatewayDashboardUrl } from '../../config/env.js';
import { READ_TOOLS } from '../../constants.js';
import logger from '../../logger.js';
import { updateContext, type OperatorContext, type ToolCall } from '../../operator-context.js';
import type { PendingPlanCommand } from './command-parser.js';
import { filler } from './format.js';
import type { TelegramReply } from './types.js';

export async function handlePendingPlanCommand(
  organizationId: string,
  clerkUserId: string,
  chatId: string,
  body: string,
  command: PendingPlanCommand,
  context: OperatorContext,
  reply: TelegramReply,
): Promise<boolean> {
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

  logger.info({ chatId, threadId, toolCallCount: approvedToolCalls.length }, '[Telegram] Approving plan');
  await reply(filler());

  const response = await fetch(`${getGatewayDashboardUrl()}/api/agent/internal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
    },
    body: JSON.stringify({
      orgId: organizationId,
      threadId,
      instruction,
      approvedToolCalls,
      clerkUserId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, err: error }, '[Telegram] Internal agent API error');
    await reply('Something went wrong running the plan. Please try again.');
    return true;
  }

  const { summary } = (await response.json()) as { summary: string };
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
