import { db } from '@shopkeeper/db';
import { STATUS } from '../../constants.js';
import logger from '../../logger.js';
import { extractOrderNumber, updateContext, type OperatorContext } from '../../operator-context.js';
import { executeOperatorAgentTurn } from '../../message-handlers/execute-operator-agent-turn.js';
import { relativeAge } from './format.js';
import type { OperatorMessageContext, OperatorReply } from '../operator-message.js';

export async function handleOrderLookup(
  organizationId: string,
  chatId: string,
  orderNumber: string,
  reply: OperatorReply,
): Promise<boolean> {
  const thread = await db.thread.findFirst({
    where: {
      organizationId,
      status: STATUS.OPEN,
      deletedAt: null,
      messages: { some: { contentText: { contains: orderNumber }, deletedAt: null } },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      aiSummary: true,
      tag: true,
      customer: { select: { name: true } },
      messages: {
        where: { senderType: { not: 'note' }, deletedAt: null },
        orderBy: { sentAt: 'desc' },
        take: 1,
        select: { sentAt: true, contentText: true },
      },
    },
  });
  if (!thread) return false;

  const lastMessage = thread.messages[0];
  const age = relativeAge(lastMessage ? Date.now() - new Date(lastMessage.sentAt).getTime() : null);
  const lines = [
    `${orderNumber} — ${thread.customer.name ?? 'Unknown customer'}`,
    thread.aiSummary ? `"${thread.aiSummary}"` : null,
    `Tag: ${thread.tag ?? 'Untagged'} · Open`,
    lastMessage
      ? `Last message${age ? ` (${age})` : ''}: "${(lastMessage.contentText ?? '').slice(0, 120)}"`
      : null,
    '',
    'Reply yes to execute the last plan, or type an instruction.',
  ].filter((line): line is string => line !== null);

  await updateContext(organizationId, chatId, {
    lastOrderNumber: orderNumber,
    lastThreadId: thread.id,
  });
  await reply(lines.join('\n'));
  return true;
}

export async function executeFreeFormInstruction(
  organizationId: string,
  clerkUserId: string,
  message: OperatorMessageContext,
  context: OperatorContext,
): Promise<void> {
  const { chatId, body, reply, presence, senderRef } = message;
  const orderNumber = extractOrderNumber(body) || context.lastOrderNumber;
  logger.info({ chatId, organizationId, orderNumber: orderNumber || null }, '[Operator] Free-form agent instruction');

  let summary: string;
  let threadId: string;
  try {
    ({ summary, threadId } = await presence(
      {
        kind: 'free-form',
        orderNumber,
        instruction: body,
      },
      () => executeOperatorAgentTurn({
        orgId: organizationId,
        instruction: body,
        ...(orderNumber ? { orderNumber } : {}),
        ...(context.lastThreadId ? { threadId: context.lastThreadId } : {}),
        senderPhone: senderRef,
        clerkUserId,
      }),
    ));
  } catch (err) {
    logger.error({ err }, '[Operator] Operator agent turn failed (free-form)');
    await reply('Something went wrong running the agent. Please try again.');
    return;
  }
  await updateContext(organizationId, chatId, {
    ...(orderNumber ? { lastOrderNumber: orderNumber } : {}),
    lastThreadId: threadId,
    history: [
      ...context.history,
      { role: 'user', content: body },
      { role: 'assistant', content: summary },
    ],
  });
  await reply(summary || 'Done.');
}
