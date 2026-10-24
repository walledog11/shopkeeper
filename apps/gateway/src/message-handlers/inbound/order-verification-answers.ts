import { db } from '@shopkeeper/db';
import { ShopifyRequestError, shopifyRestJson } from '@shopkeeper/agent/shopify';
import { parseClassifierSignals } from '@shopkeeper/agent/classifier-signals';
import {
  asksAnotherQuestion,
  continuesOrderVerificationAsk,
  ORDER_VERIFICATION_ANSWER_WINDOW_MS,
  ORDER_VERIFICATION_CHANNELS,
  orderVerificationAttemptsLeft,
} from '@shopkeeper/agent/order-verification';
import {
  carriesOrderVerificationAnswer,
  matchOrderVerificationAnswer,
  namesAnotherOrder,
  orderReferences,
} from '@shopkeeper/agent/order-verification-answer';
import logger from '../../logger.js';
import { getConversationBurst } from './conversation-burst.js';

interface ShopifyOrderIdentity {
  id: number | string;
  name?: string | null;
  email?: string | null;
  shipping_address?: { zip?: string | null } | null;
}

/** Shopify could not be asked, so an answer waits to be compared: retry the job. */
export class OrderVerificationLookupError extends Error {
  constructor(cause: unknown) {
    super('Shopify order lookup for an order confirmation failed', { cause });
    this.name = 'OrderVerificationLookupError';
  }
}

async function lookupOrder(
  integration: { accessToken: string; externalAccountId: string },
  orderName: string,
): Promise<ShopifyOrderIdentity | null | 'refused'> {
  try {
    const data = await shopifyRestJson<{ orders?: ShopifyOrderIdentity[] }>(
      { shop: integration.externalAccountId, accessToken: integration.accessToken },
      'orders.json',
      { query: { name: orderName, status: 'any', limit: 1, fields: 'id,name,email,shipping_address' } },
    );
    return data.orders?.[0] ?? null;
  } catch (err) {
    // A store that refuses the read (revoked, frozen, missing scope) will not
    // answer a retry either.
    const refused = err instanceof ShopifyRequestError
      && err.status !== undefined && err.status >= 400 && err.status < 500 && err.status !== 429;
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), refused },
      '[OrderVerification] Shopify order lookup failed',
    );
    if (refused) return 'refused';
    throw new OrderVerificationLookupError(err);
  }
}

/**
 * Runs after the burst is classified and before it is planned, so the planner
 * reads the outcome rather than deciding it. The customer's current burst
 * answers the sender's most recent ask, where they can answer it: on the thread
 * that asked, or the conversation that opens right after it when the ask went
 * unanswered there. A message that asks something else is not an answer.
 *
 * When that ask is "which order?", a reply naming an order is marked as its
 * answer and nothing is compared. Otherwise each message is compared with the
 * order it names among the sender's open asks, or the most recent one; each
 * value compared is one attempt from the sender's pooled budget, and each
 * message is recorded once in the answer ledger, under a lock on all the
 * sender's rows.
 *
 * Returns true when the current burst answered an ask, matched or not, so the
 * turn is planned whatever the classifier made of a bare "94107". It reads that
 * from the stored `answeredMessageId`, the field the planner reads too, so a
 * retried job answers the same. A later message in the burst that names another
 * order clears it: the sender has moved on. A Shopify lookup that fails
 * transiently throws, so the job retries rather than plan an uncompared answer;
 * a store that refuses the read marks the answer without comparing it.
 */
export async function evaluateOrderVerificationAnswers(
  organizationId: string,
  threadId: string,
): Promise<boolean> {
  const thread = await db.thread.findFirst({
    where: { id: threadId, organizationId },
    select: { customerId: true, channelType: true, classifierSignals: true, requestSourceMessageId: true },
  });
  if (!thread || !ORDER_VERIFICATION_CHANNELS.has(thread.channelType)) return false;

  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify', lifecycleStatus: 'active' },
    select: { accessToken: true, externalAccountId: true },
  });
  if (!integration?.accessToken || !integration.externalAccountId) return false;
  const shop = { accessToken: integration.accessToken, externalAccountId: integration.externalAccountId };
  const sender = { organizationId, customerId: thread.customerId, shopDomain: integration.externalAccountId };

  const rows = await db.orderVerification.findMany({
    where: { ...sender, requestedAt: { gt: new Date(Date.now() - ORDER_VERIFICATION_ANSWER_WINDOW_MS) } },
    orderBy: { requestedAt: 'desc' },
    select: { id: true, orderName: true, threadId: true, requestedAt: true, createdAt: true, verifiedAt: true },
  });
  const latestAsk = rows[0];
  if (!latestAsk) return false;

  const burst = await getConversationBurst(threadId);
  // Where the sender answers: the thread that asked, or the conversation that
  // opened right after it when the ask went unanswered there (an Instagram
  // episode rollover). A number in some later, unrelated conversation is not one.
  const onAskingThread = latestAsk.threadId === threadId;
  const opensAfterAsk = !onAskingThread && !burst.isFollowUp && latestAsk.threadId !== null
    && await db.message.count({
      where: {
        threadId: latestAsk.threadId, organizationId, senderType: 'customer', deletedAt: null,
        sentAt: { gt: latestAsk.requestedAt },
      },
    }) === 0;
  // Nor is one in a message that asks something else, once the classifier has
  // read this burst.
  const latestId = burst.messages.at(-1)?.id ?? null;
  const facts = latestId !== null && thread.requestSourceMessageId === latestId
    ? parseClassifierSignals(thread.classifierSignals)?.requestFacts ?? null
    : null;
  const reachable = onAskingThread || opensAfterAsk;
  const answering = reachable && continuesOrderVerificationAsk(facts);

  const messages = await db.message.findMany({
    where: {
      id: { in: burst.messages.map(message => message.id) },
      organizationId,
      senderType: 'customer',
      deletedAt: null,
      sentAt: { gte: latestAsk.createdAt },
    },
    orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
    select: { id: true, contentText: true },
  });

  // "Which order?": a reply that names one answers it, and the planner turns
  // the ask toward that order. Nothing is compared.
  if (latestAsk.orderName === null) {
    if (!reachable || asksAnotherQuestion(facts)) return false;
    const reply = [...messages].reverse().find(message => (
      orderReferences(message.contentText ?? '', { bareNumbers: true }).length > 0
    ));
    if (!reply) return false;
    await db.orderVerification.updateMany({
      where: { id: latestAsk.id, orderName: null },
      data: { answeredMessageId: reply.id, threadId },
    });
    return true;
  }

  const open = rows.filter(row => row.orderName !== null && row.verifiedAt === null);
  const targetFor = (text: string) => {
    const named = orderReferences(text);
    return open.find(row => row.orderName !== null && named.includes(row.orderName))
      ?? (latestAsk.verifiedAt === null ? latestAsk : null);
  };
  const compared = new Set((await db.orderVerificationAnswer.findMany({
    where: { organizationId, messageId: { in: messages.map(message => message.id) } },
    select: { messageId: true },
  })).map(answer => answer.messageId));
  const spent = await db.orderVerification.findMany({ where: sender, select: { attempts: true, verifiedAt: true } });
  const answers = !answering || orderVerificationAttemptsLeft(spent) === 0
    ? []
    : messages.flatMap(message => {
      const target = compared.has(message.id) ? null : targetFor(message.contentText ?? '');
      return target?.orderName && carriesOrderVerificationAnswer(message.contentText ?? '', target.orderName)
        ? [{ message, target: { id: target.id, orderName: target.orderName } }]
        : [];
    });

  const orders = new Map<string, ShopifyOrderIdentity | null | 'refused'>();
  for (const { message, target } of answers) {
    if (!orders.has(target.orderName)) orders.set(target.orderName, await lookupOrder(shop, target.orderName));
    const order = orders.get(target.orderName) ?? null;
    const matched = await db.$transaction(async (tx): Promise<boolean> => {
      await tx.$queryRaw`
        SELECT id FROM order_verifications
        WHERE organization_id = ${organizationId}::uuid AND customer_id = ${thread.customerId}::uuid
        FOR UPDATE`;
      const current = await tx.orderVerification.findMany({
        where: sender,
        select: { id: true, attempts: true, verifiedAt: true },
      });
      const row = current.find(candidate => candidate.id === target.id);
      if (!row || row.verifiedAt) return false;
      // The store refused the read: the answer is marked, so the turn stays on
      // this order, and recorded unchecked, so it is not tried again.
      if (order === 'refused') {
        const recorded = await tx.orderVerificationAnswer.createMany({
          data: [{ messageId: message.id, organizationId, orderVerificationId: row.id, outcome: 'unchecked' }],
          skipDuplicates: true,
        });
        if (recorded.count > 0) {
          await tx.orderVerification.update({ where: { id: row.id }, data: { threadId, answeredMessageId: message.id } });
        }
        return false;
      }
      const budget = orderVerificationAttemptsLeft(current);
      if (budget === 0) return true;
      const answer = matchOrderVerificationAnswer({
        text: message.contentText ?? '',
        orderName: target.orderName,
        order: order
          ? { name: order.name ?? null, email: order.email ?? null, zip: order.shipping_address?.zip ?? null }
          : null,
        budget,
      });
      if (answer.outcome === 'no_candidate') return false;
      // Another job compared it first.
      const recorded = await tx.orderVerificationAnswer.createMany({
        data: [{
          messageId: message.id, organizationId, orderVerificationId: row.id,
          outcome: answer.outcome, charged: answer.charged,
        }],
        skipDuplicates: true,
      });
      if (recorded.count === 0) return false;
      await tx.orderVerification.update({
        where: { id: row.id },
        data: {
          // The conversation the answer came in, after a rollover too.
          threadId,
          attempts: { increment: answer.charged },
          answeredMessageId: message.id,
          ...(answer.outcome === 'matched' && order
            ? { verifiedAt: new Date(), method: answer.method, orderId: String(order.id) }
            : {}),
        },
      });
      logger.info({ organizationId, threadId, outcome: answer.outcome }, '[OrderVerification] Compared an answer');
      return answer.outcome === 'matched';
    });
    if (matched) break;
  }

  // The answer this burst holds, on the order it went to.
  const answered = await db.orderVerification.findFirst({
    where: {
      ...sender,
      orderName: { not: null },
      answeredMessageId: { in: burst.messages.map(message => message.id) },
    },
    orderBy: { requestedAt: 'desc' },
    select: { id: true, orderName: true, answeredMessageId: true },
  });
  if (!answered?.orderName) return false;
  const answeredOrder = answered.orderName;
  const answeredAt = burst.messages.findIndex(message => message.id === answered.answeredMessageId);
  const movedOn = burst.messages
    .slice(answeredAt + 1)
    .some(message => namesAnotherOrder(message.contentText ?? '', answeredOrder));
  if (movedOn) {
    await db.orderVerification.updateMany({
      where: { id: answered.id, answeredMessageId: answered.answeredMessageId },
      data: { answeredMessageId: null },
    });
    return false;
  }
  return true;
}
