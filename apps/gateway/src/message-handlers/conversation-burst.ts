import { db } from '@shopkeeper/db';

export interface BurstMessage {
  id: string;
  contentText: string | null;
}

export interface ConversationBurst {
  // Any message before the trailing customer run means the merchant has seen
  // this conversation before.
  isFollowUp: boolean;
  // The trailing run of unanswered customer messages, oldest first. Empty when
  // the shop had the last word — there is no request outstanding.
  messages: BurstMessage[];
}

/**
 * The newest unanswered customer burst. One Thread is one conversation episode,
 * so scoping by threadId is already episode-local — a burst can never reach back
 * across a rollover into a conversation the shopper has moved on from.
 *
 * This is the single owner of "what is the customer actually asking right now".
 * The request summariser and the operator notification formatter both read it,
 * so a notification can never describe a different burst than the one that was
 * summarised and planned.
 */
export async function getConversationBurst(threadId: string): Promise<ConversationBurst> {
  const messages = await db.message.findMany({
    where: { threadId, deletedAt: null, senderType: { in: ['customer', 'agent', 'ai'] } },
    orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
    select: { id: true, senderType: true, contentText: true },
  });

  let trailing = 0;
  for (const message of messages) {
    if (message.senderType === 'customer') trailing += 1;
    else trailing = 0;
  }

  return {
    isFollowUp: messages.length > trailing,
    messages: messages
      .slice(messages.length - trailing)
      .map(({ id, contentText }) => ({ id, contentText })),
  };
}
