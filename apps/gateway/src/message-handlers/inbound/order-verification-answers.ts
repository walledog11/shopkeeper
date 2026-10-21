import { db } from '@shopkeeper/db';
import { ShopifyRequestError, shopifyRestJson } from '@shopkeeper/agent/shopify';
import {
  ORDER_VERIFICATION_CHANNELS,
  orderVerificationAttemptsLeft,
} from '@shopkeeper/agent/order-verification';
import {
  carriesOrderVerificationAnswer,
  matchOrderVerificationAnswer,
} from '@shopkeeper/agent/order-verification-answer';
import logger from '../../logger.js';
import { getConversationBurst } from './conversation-burst.js';

interface ShopifyOrderIdentity {
  id: number | string;
  name?: string | null;
  email?: string | null;
  shipping_address?: { zip?: string | null } | null;
}

interface Cursor {
  sentAt: Date | null;
  messageId: string | null;
}

// The order messages are read in: (sentAt, id), so two messages in the same
// second are both compared, once each.
function isAfter(message: { sentAt: Date; id: string }, cursor: Cursor): boolean {
  if (!cursor.sentAt) return true;
  if (message.sentAt.getTime() !== cursor.sentAt.getTime()) return message.sentAt > cursor.sentAt;
  return cursor.messageId === null || message.id > cursor.messageId;
}

type Step = 'next' | 'skip' | 'stop';

/** Shopify could not be asked, so an answer waits to be compared: retry the job. */
export class OrderVerificationLookupError extends Error {
  constructor(cause: unknown) {
    super('Shopify order lookup for an order confirmation failed', { cause });
    this.name = 'OrderVerificationLookupError';
  }
}

/**
 * Runs before the turn is planned, so the planner reads the outcome rather than
 * deciding it: the sender's messages since the agent first asked are compared
 * with the order in Shopify, and each email or zip compared is one attempt from
 * the sender's pooled budget. Each comparison holds a lock on every row of the
 * sender, so two jobs cannot both spend the last attempt, and is recorded with
 * the message as the row's cursor, so a redelivered job never compares it again.
 *
 * Returns true when the customer's current burst answered the ask, matched or
 * not, so the turn is planned whatever the classifier made of a bare "94107".
 * It reads that from the stored `answeredMessageId`, the field the planner reads
 * too, so a retried job answers the same. A Shopify lookup that fails throws, so
 * the job retries rather than plan a turn whose answer was never compared.
 */
export async function evaluateOrderVerificationAnswers(
  organizationId: string,
  threadId: string,
): Promise<boolean> {
  const thread = await db.thread.findFirst({
    where: { id: threadId, organizationId },
    select: { customerId: true, channelType: true },
  });
  if (!thread || !ORDER_VERIFICATION_CHANNELS.has(thread.channelType)) return false;

  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify', lifecycleStatus: 'active' },
    select: { id: true, accessToken: true, externalAccountId: true },
  });
  if (!integration?.accessToken || !integration.externalAccountId) return false;

  const asked = await db.orderVerification.findFirst({
    where: { organizationId, customerId: thread.customerId, threadId, integrationId: integration.id },
    orderBy: { requestedAt: 'desc' },
    select: {
      id: true, orderName: true, evaluatedThrough: true, evaluatedThroughMessageId: true,
      answeredMessageId: true, verifiedAt: true,
    },
  });
  if (!asked) return false;

  const [messages, burst] = await Promise.all([
    db.message.findMany({
      where: {
        threadId,
        organizationId,
        senderType: 'customer',
        deletedAt: null,
        ...(asked.evaluatedThrough ? { sentAt: { gte: asked.evaluatedThrough } } : {}),
      },
      orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
      select: { id: true, contentText: true, sentAt: true },
    }),
    getConversationBurst(threadId),
  ]);
  const unevaluated = asked.verifiedAt
    ? []
    : messages.filter(message => isAfter(message, {
      sentAt: asked.evaluatedThrough,
      messageId: asked.evaluatedThroughMessageId,
    }));

  let answeredMessageId = asked.answeredMessageId;
  if (unevaluated.some(message => carriesOrderVerificationAnswer(message.contentText ?? '', asked.orderName))) {
    let order: ShopifyOrderIdentity | null;
    try {
      const data = await shopifyRestJson<{ orders?: ShopifyOrderIdentity[] }>(
        { shop: integration.externalAccountId, accessToken: integration.accessToken },
        'orders.json',
        { query: { name: asked.orderName, status: 'any', limit: 1, fields: 'id,name,email,shipping_address' } },
      );
      order = data.orders?.[0] ?? null;
    } catch (err) {
      // A store that refuses the read (revoked or missing scope) will not answer
      // a retry either: the turn is planned uncompared, and the ask cap hands
      // the sender to the merchant.
      const refused = err instanceof ShopifyRequestError
        && err.status !== undefined && err.status >= 400 && err.status < 500 && err.status !== 429;
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), organizationId, threadId, refused },
        '[OrderVerification] Shopify order lookup failed',
      );
      if (refused) return true;
      throw new OrderVerificationLookupError(err);
    }
    const orderFacts = order
      ? { name: order.name ?? null, email: order.email ?? null, zip: order.shipping_address?.zip ?? null }
      : null;

    for (const message of unevaluated) {
      const step = await db.$transaction(async (tx): Promise<Step> => {
        await tx.$queryRaw`
          SELECT id FROM order_verifications
          WHERE organization_id = ${organizationId}::uuid AND customer_id = ${thread.customerId}::uuid
          FOR UPDATE`;
        const rows = await tx.orderVerification.findMany({
          where: { organizationId, customerId: thread.customerId, integrationId: integration.id },
          select: {
            id: true, attempts: true, verifiedAt: true, evaluatedThrough: true, evaluatedThroughMessageId: true,
          },
        });
        const row = rows.find(candidate => candidate.id === asked.id);
        if (!row || row.verifiedAt) return 'stop';
        // Another job compared it first.
        if (!isAfter(message, { sentAt: row.evaluatedThrough, messageId: row.evaluatedThroughMessageId })) {
          return 'skip';
        }
        const budget = orderVerificationAttemptsLeft(rows);
        if (budget === 0) return 'stop';
        const answer = matchOrderVerificationAnswer({
          text: message.contentText ?? '',
          orderName: asked.orderName,
          order: orderFacts,
          budget,
        });
        await tx.orderVerification.update({
          where: { id: row.id },
          data: {
            evaluatedThrough: message.sentAt,
            evaluatedThroughMessageId: message.id,
            ...(answer.outcome === 'no_candidate'
              ? {}
              : { attempts: { increment: answer.charged }, answeredMessageId: message.id }),
            ...(answer.outcome === 'matched' && order
              ? { verifiedAt: new Date(), method: answer.method, orderId: String(order.id) }
              : {}),
          },
        });
        if (answer.outcome !== 'no_candidate') {
          logger.info({ organizationId, threadId, outcome: answer.outcome }, '[OrderVerification] Compared an answer');
        }
        return answer.outcome === 'matched' ? 'stop' : 'next';
      });
      if (step === 'stop') break;
    }
    const stored = await db.orderVerification.findUnique({
      where: { id: asked.id },
      select: { answeredMessageId: true },
    });
    answeredMessageId = stored?.answeredMessageId ?? answeredMessageId;
  }

  return answeredMessageId !== null && burst.messages.some(message => message.id === answeredMessageId);
}
