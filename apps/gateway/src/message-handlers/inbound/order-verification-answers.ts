import { db } from '@shopkeeper/db';
import { ShopifyRequestError, shopifyRestJson } from '@shopkeeper/agent/shopify';
import { parseClassifierSignals } from '@shopkeeper/agent/classifier-signals';
import {
  continuesOrderVerificationAsk,
  ORDER_VERIFICATION_CHANNELS,
  orderVerificationAttemptsLeft,
} from '@shopkeeper/agent/order-verification';
import {
  carriesOrderVerificationAnswer,
  matchOrderVerificationAnswer,
  namesAnotherOrder,
} from '@shopkeeper/agent/order-verification-answer';
import logger from '../../logger.js';
import { getConversationBurst } from './conversation-burst.js';

interface ShopifyOrderIdentity {
  id: number | string;
  name?: string | null;
  email?: string | null;
  shipping_address?: { zip?: string | null } | null;
}

// An ask older than this is not answered by a message that happens to carry a
// zip; the agent asks again if the sender comes back to it.
const ANSWER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
 * Runs before the turn is planned, so the planner reads the outcome rather than
 * deciding it. The messages of the customer's current burst are compared with
 * the order the sender was most recently asked about, on any of their threads,
 * so an answer that arrives after an episode rollover still counts. Each value
 * compared is one attempt from the sender's pooled budget, and each message is
 * recorded once in the answer ledger, whenever it arrives, under a lock on all
 * the sender's rows.
 *
 * Returns true when the current burst answered the ask, matched or not, so the
 * turn is planned whatever the classifier made of a bare "94107". It reads that
 * from the stored `answeredMessageId`, the field the planner reads too, so a
 * retried job answers the same. A later message in the burst that names another
 * order clears it: the sender has moved on. A Shopify lookup that fails
 * transiently throws, so the job retries rather than plan an uncompared answer;
 * a store that refuses the read plans the turn uncompared.
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
  const sender = { organizationId, customerId: thread.customerId, shopDomain: integration.externalAccountId };

  const asked = await db.orderVerification.findFirst({
    where: {
      ...sender,
      orderName: { not: null },
      requestedAt: { gt: new Date(Date.now() - ANSWER_WINDOW_MS) },
    },
    orderBy: { requestedAt: 'desc' },
    select: { id: true, orderName: true, threadId: true, requestedAt: true, createdAt: true, verifiedAt: true },
  });
  if (!asked?.orderName) return false;
  const orderName = asked.orderName;

  const burst = await getConversationBurst(threadId);
  // Where the sender answers: the thread that asked, or the conversation that
  // opened right after it when the ask went unanswered there (an Instagram
  // episode rollover). A number in some later, unrelated conversation is not one.
  const onAskingThread = asked.threadId === threadId;
  const opensAfterAsk = !onAskingThread && !burst.isFollowUp && asked.threadId !== null
    && await db.message.count({
      where: {
        threadId: asked.threadId, organizationId, senderType: 'customer', deletedAt: null,
        sentAt: { gt: asked.requestedAt },
      },
    }) === 0;
  // Nor is one in a message that asks something else, when the classifier has
  // read this burst.
  const latestId = burst.messages.at(-1)?.id ?? null;
  const facts = latestId !== null && thread.requestSourceMessageId === latestId
    ? parseClassifierSignals(thread.classifierSignals)?.requestFacts ?? null
    : null;
  const answering = (onAskingThread || opensAfterAsk) && continuesOrderVerificationAsk(facts);
  const messages = await db.message.findMany({
    where: {
      id: { in: burst.messages.map(message => message.id) },
      organizationId,
      senderType: 'customer',
      deletedAt: null,
      sentAt: { gte: asked.createdAt },
    },
    orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
    select: { id: true, contentText: true },
  });
  const compared = new Set((await db.orderVerificationAnswer.findMany({
    where: { organizationId, messageId: { in: messages.map(message => message.id) } },
    select: { messageId: true },
  })).map(answer => answer.messageId));
  const spent = await db.orderVerification.findMany({ where: sender, select: { attempts: true, verifiedAt: true } });
  const answers = !answering || asked.verifiedAt || orderVerificationAttemptsLeft(spent) === 0
    ? []
    : messages.filter(message => (
      !compared.has(message.id) && carriesOrderVerificationAnswer(message.contentText ?? '', orderName)
    ));

  if (answers.length > 0) {
    const order = await lookupOrder(
      { accessToken: integration.accessToken, externalAccountId: integration.externalAccountId },
      orderName,
    );
    if (order === 'refused') {
      await db.orderVerificationAnswer.createMany({
        data: answers.map(message => ({
          messageId: message.id, organizationId, orderVerificationId: asked.id, outcome: 'unchecked' as const,
        })),
        skipDuplicates: true,
      });
      return true;
    }
    const orderFacts = order
      ? { name: order.name ?? null, email: order.email ?? null, zip: order.shipping_address?.zip ?? null }
      : null;

    for (const message of answers) {
      const matched = await db.$transaction(async (tx): Promise<boolean> => {
        await tx.$queryRaw`
          SELECT id FROM order_verifications
          WHERE organization_id = ${organizationId}::uuid AND customer_id = ${thread.customerId}::uuid
          FOR UPDATE`;
        const rows = await tx.orderVerification.findMany({
          where: sender,
          select: { id: true, attempts: true, verifiedAt: true },
        });
        const row = rows.find(candidate => candidate.id === asked.id);
        if (!row || row.verifiedAt) return true;
        const budget = orderVerificationAttemptsLeft(rows);
        if (budget === 0) return true;
        const answer = matchOrderVerificationAnswer({
          text: message.contentText ?? '',
          orderName,
          order: orderFacts,
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
  }

  const stored = await db.orderVerification.findUnique({
    where: { id: asked.id },
    select: { answeredMessageId: true },
  });
  const answeredMessageId = stored?.answeredMessageId ?? null;
  const answeredAt = burst.messages.findIndex(message => message.id === answeredMessageId);
  if (answeredAt < 0) return false;
  const movedOn = burst.messages
    .slice(answeredAt + 1)
    .some(message => namesAnotherOrder(message.contentText ?? '', orderName));
  if (movedOn) {
    await db.orderVerification.updateMany({
      where: { id: asked.id, answeredMessageId },
      data: { answeredMessageId: null },
    });
    return false;
  }
  return true;
}
