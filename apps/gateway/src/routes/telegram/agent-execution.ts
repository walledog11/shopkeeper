import { db } from '@shopkeeper/db';
import { STATUS } from '../../constants.js';
import logger from '../../logger.js';
import { updateContext } from '../../operator-context.js';
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
): Promise<void> {
  const { chatId, body, reply, presence, senderRef } = message;
  logger.info({ chatId, organizationId }, '[Operator] Free-form agent instruction');

  // The turn runs on the merchant's durable operator thread (resolved from the
  // binding key) and resolves any order references via tools from the text — no
  // more per-order thread targeting. It persists both sides of the exchange, so
  // this delivery reply must stay raw (unmirrored).
  let summary: string;
  try {
    ({ summary } = await presence(
      { kind: 'free-form', instruction: body },
      () => executeOperatorAgentTurn({
        orgId: organizationId,
        instruction: body,
        operatorKey: senderRef,
        senderPhone: senderRef,
        clerkUserId,
      }),
    ));
  } catch (err) {
    logger.error({ err }, '[Operator] Operator agent turn failed (free-form)');
    await reply('Something went wrong running the agent. Please try again.');
    return;
  }
  await reply(summary || 'Done.');
}
