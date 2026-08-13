import { db } from '@shopkeeper/db';
import logger from '../../logger.js';
import {
  formatDigestReplyConfirmation,
  formatDigestSpamConfirmation,
  formatDigestThreadBlurb,
  loadDigestThreads,
  markDigestThreadSpam,
  sendDigestThreadReply,
} from '../../message-handlers/digest-triage.js';
import type { OperatorContext } from '../../operator-context.js';
import type { DigestCommand } from './command-parser.js';
import { relativeAge } from './format.js';
import type { OperatorMessageContext } from '../operator-message.js';

export async function handleDigestCommand(
  organizationId: string,
  command: DigestCommand,
  context: OperatorContext,
  message: OperatorMessageContext,
): Promise<boolean> {
  const { reply, presence } = message;
  if (!context.pendingDigest) return false;

  // Ordinals index the briefing the merchant is looking at, not the flagged
  // subset. They used to be separate lists that both started at 1, so "spam 2"
  // and "2 yes" pointed at different tickets and the merchant had no way to know.
  const { items } = context.pendingDigest;
  const threadIds = items.filter((item) => item.kind === 'flagged').map((item) => item.threadId);
  if (command.type === 'digest-review') {
    if (threadIds.length === 0) {
      await reply('No flagged tickets in your last digest.');
      return true;
    }
    const entries = await loadDigestThreads(organizationId, threadIds);
    const lines = ['Flagged tickets:'];
    for (const entry of entries) {
      if (!entry.thread) continue;
      const blurb = formatDigestThreadBlurb(entry.thread);
      lines.push(`${entry.index}. ${entry.thread.customer.name ?? 'Unknown'}${blurb ? ` — ${blurb}` : ''}`);
    }
    lines.push('', 'OPEN <n> · SPAM <n> · REPLY <n> <text>');
    await reply(lines.join('\n'));
    return true;
  }

  const target = items[command.index - 1];
  if (!target) {
    await reply(`There's no ${command.index} on that list.`);
    return true;
  }
  // Fail closed and say which item they hit: silently acting on the neighbouring
  // ticket is how a real customer gets binned by an off-by-one.
  if (target.kind !== 'flagged') {
    await reply(target.kind === 'approval'
      ? `Number ${command.index} is a reply I've already drafted, not a flagged ticket. Say "${command.index} yes" to send it.`
      : `Number ${command.index} isn't one I flagged, so tell me what to do with it instead.`);
    return true;
  }
  const targetId = target.threadId;

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
    const result = await markDigestThreadSpam(organizationId, context.pendingDigest, targetId);
    if (!result.ok) {
      await reply('Ticket not found.');
      return true;
    }
    await reply(formatDigestSpamConfirmation(result.customerName, result.index));
    return true;
  }

  const replyTarget = await db.thread.findFirst({
    where: { id: targetId, organizationId },
    select: { customer: { select: { name: true } } },
  });
  if (!replyTarget) {
    await reply('Ticket not found.');
    return true;
  }

  const response = await presence(
    {
      kind: 'digest-reply',
      ticketIndex: command.index,
    },
    () => sendDigestThreadReply(targetId, command.text),
  );
  if (!response.ok) {
    logger.error({ status: response.status, err: response.responseBody, threadId: targetId }, '[Operator] Digest REPLY failed');
    await reply(response.outcome === 'unknown'
      ? 'I could not confirm whether that reply sent. Check the ticket before trying again.'
      : 'Reply failed to send. Please try again from the dashboard.');
    return true;
  }
  await reply(formatDigestReplyConfirmation(replyTarget.customer.name, command.index, command.text));
  return true;
}
