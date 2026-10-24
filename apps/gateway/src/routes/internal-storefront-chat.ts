import express, { type Request, type Response, type Router } from 'express';
import { db } from '@shopkeeper/db';
import { CHANNEL, QUEUE } from '../constants.js';
import logger from '../logger.js';
import { getGatewayBullMqQueue } from '../clients/gateway-queues.js';
import { internalJsonParser } from './body-parsers.js';
import { authorizeInternalRequest } from './internal-auth.js';
import { processInboundMessage } from '../message-handlers/inbound/inbound-persistence.js';
import {
  claimStorefrontChatBudget,
  storefrontChatDenialMessage,
  StorefrontChatBudgetError,
  StorefrontChatSessionUnavailableError,
  reportStorefrontChatExhaustion,
} from '../storefront-chat-budget.js';

// Storefront shopper messages enter here rather than being persisted by the
// dashboard directly, so they run the same inbound pipeline as every other
// channel: dedupe, classification, summary, plan precompute, operator notify.
// The dashboard owns only the app-proxy signature check, because Shopify signs
// that request against the proxy URL and nothing else can verify it.
export function registerInternalStorefrontChatRoutes(router: Router): void {
  router.post('/storefront-chat/message', internalJsonParser(), async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalStorefrontChat')) return;

    const { organizationId, sessionId, text, clientMessageId, shopperIp } = (req.body ?? {}) as Record<string, string>;

    if (!organizationId || !sessionId || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'organizationId, sessionId and text are required' });
    }

    const session = await db.storefrontChatSession.findFirst({
      where: {
        id: sessionId, organizationId, revokedAt: null, expiresAt: { gt: new Date() },
        organization: { lifecycleStatus: 'active' },
        integration: { lifecycleStatus: 'active', metadata: { path: ['storefrontChat', 'enabled'], equals: true } },
      },
      select: { id: true, integrationId: true },
    });
    if (!session) {
      return res.status(404).json({ error: 'session not found' });
    }

    try {
      const result = await processInboundMessage(
        organizationId,
        `${CHANNEL.SHOPIFY_CHAT}:${session.id}`,
        CHANNEL.SHOPIFY_CHAT,
        text,
        getGatewayBullMqQueue(QUEUE.AI_SUMMARY),
        {
          integrationId: session.integrationId,
          // Scoped by session so a shopper retrying the same client id is a
          // no-op, matching the widget's optimistic retry.
          externalMessageId: clientMessageId
            ? `${CHANNEL.SHOPIFY_CHAT}:${session.id}:${clientMessageId}`
            : null,
          isRealCustomerMessage: true,
          // Lets the episode row be written inside the same transaction that
          // opens the episode. Verification resolves through that row, so a
          // session bound afterwards would read as guest in between.
          storefrontSessionId: session.id,
          admitMessage: async (tx, thread) => {
            const verdict = await claimStorefrontChatBudget({
              organizationId, integrationId: session.integrationId, sessionId: session.id,
              shopperIp: typeof shopperIp === 'string' && shopperIp ? shopperIp : null,
            }, tx);
            if (!verdict.allowed) throw new StorefrontChatBudgetError(verdict);
            await tx.storefrontChatSession.update({
              where: { id: session.id },
              data: { threadId: thread.id, customerId: thread.customerId },
            });
          },
        },
      );

      if (!result) {
        return res.status(200).json({ deduped: true });
      }

      return res.status(202).json({ threadId: result.thread.id, isNewThread: result.isNew });
    } catch (err) {
      if (err instanceof StorefrontChatSessionUnavailableError) return res.status(404).json({ error: 'session not found' });
      if (err instanceof StorefrontChatBudgetError && err.verdict.denial) {
        const { denial, retryAt } = err.verdict;
        if (retryAt) res.set('Retry-After', String(Math.max(0, retryAt - Math.floor(Date.now() / 1000))));
        if (denial === 'shop_budget') await reportStorefrontChatExhaustion(organizationId, session.integrationId);
        return res.status(429).json({ error: 'storefront chat budget exhausted', denial, shopperMessage: storefrontChatDenialMessage(denial) });
      }
      logger.error({ err, organizationId, sessionId }, '[StorefrontChat] Failed to persist shopper message');
      return res.status(500).json({ error: 'failed to persist message' });
    }
  });
}

const router = express.Router();
registerInternalStorefrontChatRoutes(router);
export default router;
