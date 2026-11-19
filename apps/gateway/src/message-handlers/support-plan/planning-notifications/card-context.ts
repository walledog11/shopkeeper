import { db, type DbChannelType } from '@shopkeeper/db';
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants';
import { listConfirmedOrders } from '../../../storefront-chat-verified-orders.js';
import { buildRequestDisplaySnapshot, requestDisplayHasContext } from '../../shared/request-display.js';
import { getConversationStage } from './conversation-stage.js';

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

/**
 * What a card or notice email about a thread opens with (`formatCardOpening`):
 * who wrote, what they asked, or their own words when the request cannot be
 * rendered, and the orders they confirmed.
 */
export async function loadCardOpening(input: {
  organizationId: string;
  threadId: string;
  customerName: string | null;
  channelType: DbChannelType;
  sourceMessageId?: string | null;
}) {
  const { organizationId, threadId, channelType, sourceMessageId } = input;
  const [customerName, stage, verifiedOrders, requestDisplay] = await Promise.all([
    input.customerName ? Promise.resolve(input.customerName) : storedCustomerName(organizationId, threadId),
    getConversationStage(threadId),
    listConfirmedOrders(organizationId, threadId, channelType),
    buildRequestDisplaySnapshot({ organizationId, threadId, sourceMessageId }),
  ]);
  const sourceMessageText = requestDisplayHasContext(requestDisplay)
    ? null
    : await loadRequestSourceText(organizationId, threadId, sourceMessageId).catch(() => null);
  return { customerName, channelType, stage, verifiedOrders, requestDisplay, sourceMessageText };
}
