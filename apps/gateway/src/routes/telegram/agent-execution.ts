import { db } from '@shopkeeper/db';
import { getGatewayDashboardUrl } from '../../config/env.js';
import { STATUS } from '../../constants.js';
import logger from '../../logger.js';
import { extractOrderNumber, updateContext, type OperatorContext } from '../../operator-context.js';
import { filler, relativeAge } from './format.js';
import type { TelegramReply } from './types.js';

export async function handleOrderLookup(
  organizationId: string,
  chatId: string,
  orderNumber: string,
  reply: TelegramReply,
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
  chatId: string,
  body: string,
  context: OperatorContext,
  reply: TelegramReply,
): Promise<void> {
  const orderNumber = extractOrderNumber(body) || context.lastOrderNumber;
  logger.info({ chatId, organizationId, orderNumber: orderNumber || null }, '[Telegram] Free-form agent instruction');
  await reply(filler());

  const response = await fetch(`${getGatewayDashboardUrl()}/api/agent/internal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
    },
    body: JSON.stringify({
      orgId: organizationId,
      instruction: body,
      ...(orderNumber ? { orderNumber } : {}),
      ...(context.lastThreadId ? { threadId: context.lastThreadId } : {}),
      senderPhone: `telegram:${chatId}`,
      clerkUserId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error({ status: response.status, err: error }, '[Telegram] Internal agent API error (free-form)');
    await reply('Something went wrong running the agent. Please try again.');
    return;
  }

  const { summary, threadId } = (await response.json()) as { summary: string; threadId: string };
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
