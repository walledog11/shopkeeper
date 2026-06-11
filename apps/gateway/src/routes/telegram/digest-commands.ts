import { db } from '@shopkeeper/db';
import { postDashboardInternal } from '../../clients/dashboard-internal.js';
import logger from '../../logger.js';
import type { OperatorContext } from '../../operator-context.js';
import type { DigestCommand } from './command-parser.js';
import { relativeAge } from './format.js';
import { withOperatorPresence } from './presence.js';
import type { TelegramMessageContext } from './types.js';

export async function handleDigestCommand(
  organizationId: string,
  command: DigestCommand,
  context: OperatorContext,
  message: TelegramMessageContext,
): Promise<boolean> {
  const { chatId, messageId, reply } = message;
  if (!context.pendingDigest) return false;

  const { threadIds } = context.pendingDigest;
  if (command.type === 'digest-review') {
    if (threadIds.length === 0) {
      await reply('No flagged tickets in your last digest.');
      return true;
    }
    const rows = await db.thread.findMany({
      where: { id: { in: threadIds }, organizationId },
      select: { id: true, aiSummary: true, filterReason: true, customer: { select: { name: true } } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const lines = ['Flagged tickets:'];
    threadIds.forEach((id, index) => {
      const thread = byId.get(id);
      if (!thread) return;
      const blurb = (thread.aiSummary ?? thread.filterReason ?? '').trim();
      const truncated = blurb.length > 90 ? `${blurb.slice(0, 90)}…` : blurb;
      lines.push(`${index + 1}. ${thread.customer.name ?? 'Unknown'}${truncated ? ` — ${truncated}` : ''}`);
    });
    lines.push('', 'OPEN <n> · SPAM <n> · REPLY <n> <text>');
    await reply(lines.join('\n'));
    return true;
  }

  const targetIndex = command.index - 1;
  if (targetIndex < 0 || targetIndex >= threadIds.length) {
    await reply(`No flagged ticket ${command.index}. Reply REVIEW to see the list.`);
    return true;
  }
  const targetId = threadIds[targetIndex];

  if (command.type === 'digest-open') {
    const thread = await db.thread.findFirst({
      where: { id: targetId, organizationId },
      select: {
        aiSummary: true,
        tag: true,
        filterReason: true,
        customer: { select: { name: true } },
        messages: {
          where: { senderType: { not: 'note' }, deletedAt: null },
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { sentAt: true, contentText: true },
        },
      },
    });
    if (!thread) {
      await reply('Ticket not found.');
      return true;
    }
    const last = thread.messages[0];
    const age = relativeAge(last ? Date.now() - new Date(last.sentAt).getTime() : null);
    const lines = [
      `${command.index}. ${thread.customer.name ?? 'Unknown'}`,
      thread.aiSummary ? `"${thread.aiSummary}"` : null,
      `Tag: ${thread.tag ?? 'Untagged'}${thread.filterReason ? ` · Flagged: ${thread.filterReason}` : ''}`,
      last ? `Last${age ? ` (${age})` : ''}: "${(last.contentText ?? '').slice(0, 120)}"` : null,
      '',
      `Reply SPAM ${command.index} or REPLY ${command.index} <text>.`,
    ].filter((line): line is string => line !== null);
    await reply(lines.join('\n'));
    return true;
  }

  if (command.type === 'digest-spam') {
    await db.thread.update({
      where: { id: targetId },
      data: {
        filterStatus: 'filtered',
        filterFeedback: 'confirmed_spam',
        filterDecidedAt: new Date(),
      },
    });
    await reply(`Marked ${command.index} as spam.`);
    return true;
  }

  const response = await withOperatorPresence(
    {
      chatId,
      messageId,
      reply,
      progress: {
        kind: 'digest-reply',
        ticketIndex: command.index,
      },
    },
    () => postDashboardInternal('/api/messages/internal', {
      threadId: targetId,
      text: command.text,
    }),
  );
  if (!response.ok) {
    logger.error({ status: response.status, err: response.responseBody, threadId: targetId }, '[Telegram] Digest REPLY failed');
    await reply('Reply failed to send. Please try again from the dashboard.');
    return true;
  }
  await reply(`Reply sent on ticket ${command.index}.`);
  return true;
}
