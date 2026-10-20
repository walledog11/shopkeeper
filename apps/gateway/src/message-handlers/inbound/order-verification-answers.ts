import { db } from '@shopkeeper/db';
import { shopifyRestJson } from '@shopkeeper/agent/shopify';
import {
  ORDER_VERIFICATION_CHANNELS,
  ORDER_VERIFICATION_MAX_ATTEMPTS,
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

/** Null when Shopify has no such order; undefined when it could not be asked. */
async function lookupOrder(organizationId: string, orderName: string): Promise<ShopifyOrderIdentity | null | undefined> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify', lifecycleStatus: 'active' },
    select: { accessToken: true, externalAccountId: true },
  });
  if (!integration?.accessToken || !integration.externalAccountId) return undefined;
  try {
    const data = await shopifyRestJson<{ orders?: ShopifyOrderIdentity[] }>(
      { shop: integration.externalAccountId, accessToken: integration.accessToken },
      'orders.json',
      { query: { name: orderName, status: 'any', limit: 1, fields: 'id,name,email,shipping_address' } },
    );
    return data.orders?.[0] ?? null;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), organizationId },
      '[OrderVerification] Shopify order lookup failed',
    );
    return undefined;
  }
}

/**
 * Runs before the turn is planned, so the planner reads the outcome rather than
 * deciding it: the sender's messages since the agent asked are compared with the
 * order in Shopify, and each one that carried an email or zip is one attempt.
 * Every write is conditional on the row still being pending and on the message
 * being newer than the last one compared, so a redelivered job charges and
 * matches each message at most once.
 *
 * Returns true when the customer's current burst answered the ask, matched or
 * not, so the turn is planned whatever the classifier made of a bare "94107".
 * It reads that from the stored `answeredMessageId`, the field the planner reads
 * too, so a retried job answers the same.
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

  const asked = await db.orderVerification.findFirst({
    where: { organizationId, customerId: thread.customerId, threadId },
    orderBy: { requestedAt: 'desc' },
    select: {
      id: true, orderName: true, requestedAt: true, evaluatedThrough: true, answeredMessageId: true,
      verifiedAt: true, attempts: true,
    },
  });
  if (!asked) return false;

  const [messages, burst] = await Promise.all([
    db.message.findMany({
      where: { threadId, organizationId, senderType: 'customer', deletedAt: null, sentAt: { gt: asked.requestedAt } },
      orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
      select: { id: true, contentText: true, sentAt: true },
    }),
    getConversationBurst(threadId),
  ]);
  const burstIds = new Set(burst.messages.map(message => message.id));
  let answeredMessageId = asked.answeredMessageId;
  const pending = asked.verifiedAt === null && asked.attempts < ORDER_VERIFICATION_MAX_ATTEMPTS;
  const unevaluated = pending
    ? messages.filter(message => !asked.evaluatedThrough || message.sentAt > asked.evaluatedThrough)
    : [];
  if (unevaluated.some(message => carriesOrderVerificationAnswer(message.contentText ?? '', asked.orderName))) {
    const order = await lookupOrder(organizationId, asked.orderName);
    // Nothing is compared or charged, and the next message tries again; the
    // turn is still planned so the answer is not dropped.
    if (order === undefined) return true;
    const orderFacts = order
      ? { name: order.name ?? null, email: order.email ?? null, zip: order.shipping_address?.zip ?? null }
      : null;
    for (const message of unevaluated) {
      const answer = matchOrderVerificationAnswer({
        text: message.contentText ?? '',
        orderName: asked.orderName,
        order: orderFacts,
      });
      const claimed = await db.orderVerification.updateMany({
        where: {
          id: asked.id,
          organizationId,
          verifiedAt: null,
          attempts: { lt: ORDER_VERIFICATION_MAX_ATTEMPTS },
          OR: [{ evaluatedThrough: null }, { evaluatedThrough: { lt: message.sentAt } }],
        },
        data: {
          evaluatedThrough: message.sentAt,
          ...(answer.outcome === 'no_candidate' ? {} : { attempts: { increment: 1 }, answeredMessageId: message.id }),
          ...(answer.outcome === 'matched' && order
            ? { verifiedAt: new Date(), method: answer.method, orderId: String(order.id) }
            : {}),
        },
      });
      if (claimed.count === 0) break;
      if (answer.outcome !== 'no_candidate') {
        logger.info({ organizationId, threadId, outcome: answer.outcome }, '[OrderVerification] Compared an answer');
      }
      if (answer.outcome === 'matched') break;
    }
    // Another job may have compared some of these first.
    const stored = await db.orderVerification.findUnique({
      where: { id: asked.id },
      select: { answeredMessageId: true },
    });
    answeredMessageId = stored?.answeredMessageId ?? answeredMessageId;
  }

  return answeredMessageId !== null && burstIds.has(answeredMessageId);
}
