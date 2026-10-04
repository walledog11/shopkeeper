import { db } from '@shopkeeper/db';
import { selectCustomerBurst } from '@shopkeeper/agent/message-history';

export interface BurstMessage {
  id: string;
  contentText: string | null;
}

export interface ConversationBurst {
  // Any message before the trailing customer run means the merchant has seen
  // this conversation before.
  isFollowUp: boolean;
  // The trailing run of unanswered customer messages, oldest first. Empty when
  // the shop had the last word or a committed plan already acted on the latest
  // message — there is no request outstanding.
  messages: BurstMessage[];
}

/**
 * The newest unanswered customer burst. One Thread is one conversation episode,
 * so scoping by threadId is already episode-local — a burst can never reach back
 * across a rollover into a conversation the shopper has moved on from.
 *
 * A committed plan execution closes the burst at its source message, as a reply
 * does, even when it sent the customer nothing: an escalation hands that request
 * to the merchant. Otherwise a handed-off request stays "current" and is merged
 * into, and escalated over, every later message on the thread.
 *
 * This is the single owner of "what is the customer actually asking right now".
 * The request summariser and the operator notification formatter both read it,
 * so a notification can never describe a different burst than the one that was
 * summarised and planned.
 */
export async function getConversationBurst(threadId: string): Promise<ConversationBurst> {
  const [messages, handled] = await Promise.all([
    db.message.findMany({
      where: { threadId, deletedAt: null, senderType: { in: ['customer', 'agent', 'ai'] } },
      orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
      select: { id: true, senderType: true, contentText: true },
    }),
    db.planExecution.findMany({
      where: { threadId, status: 'committed', sourceMessageId: { not: null } },
      select: { sourceMessageId: true },
    }),
  ]);
  const current = selectCustomerBurst(messages, new Set(handled.flatMap(execution => (
    execution.sourceMessageId ? [execution.sourceMessageId] : []
  ))));

  return {
    isFollowUp: messages.length > current.length,
    messages: current.map(({ id, contentText }) => ({ id, contentText })),
  };
}
