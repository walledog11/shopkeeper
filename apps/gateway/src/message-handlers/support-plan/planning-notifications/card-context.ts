import { db } from '@shopkeeper/db';
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants';

/**
 * The customer's message behind this plan, for the card to quote when the
 * request snapshot cannot render one. The thread filter is the alignment check:
 * `buildRequestDisplaySnapshot` returns `unavailable` both for a stale source
 * message and for a classifier version older than the display format, and only
 * the second of those is safe to quote — a superseded message is not what the
 * merchant is being asked about.
 */
export async function loadRequestSourceText(
  organizationId: string,
  threadId: string,
  sourceMessageId: string | null | undefined,
): Promise<string | null> {
  if (!sourceMessageId) return null;
  const message = await db.message.findFirst({
    where: {
      id: sourceMessageId,
      organizationId,
      threadId,
      senderType: SENDER_TYPE.CUSTOMER,
      deletedAt: null,
      thread: { requestSourceMessageId: sourceMessageId },
    },
    select: { contentText: true },
  });
  return message?.contentText ?? null;
}

// A profile lookup that came back empty is not a customer without a name.
export async function storedCustomerName(organizationId: string, threadId: string): Promise<string | null> {
  const thread = await db.thread.findFirst({
    where: { id: threadId, organizationId },
    select: { customer: { select: { name: true } } },
  }).catch(() => null);
  return thread?.customer.name ?? null;
}
