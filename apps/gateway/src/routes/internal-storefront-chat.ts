import express, { type Request, type Response, type Router } from 'express';
import { db } from '@shopkeeper/db';
import { CHANNEL, QUEUE } from '../constants.js';
import logger from '../logger.js';
import { getGatewayBullMqQueue } from '../clients/gateway-queues.js';
import { internalJsonParser } from './body-parsers.js';
import { authorizeInternalRequest } from './internal-auth.js';
import { processInboundMessage } from '../message-handlers/inbound-persistence.js';

// Storefront shopper messages enter here rather than being persisted by the
// dashboard directly, so they run the same inbound pipeline as every other
// channel: dedupe, classification, summary, plan precompute, operator notify.
// The dashboard owns only the app-proxy signature check, because Shopify signs
// that request against the proxy URL and nothing else can verify it.
export function registerInternalStorefrontChatRoutes(router: Router): void {
  router.post('/storefront-chat/message', internalJsonParser(), async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalStorefrontChat')) return;

    const { organizationId, sessionId, integrationId, text, clientMessageId } = (req.body ?? {}) as Record<string, string>;

    if (!organizationId || !sessionId || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'organizationId, sessionId and text are required' });
    }

    const session = await db.storefrontChatSession.findFirst({
      where: { id: sessionId, organizationId, revokedAt: null },
      select: { id: true, customerId: true, threadId: true },
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
          integrationId: integrationId ?? null,
          // Scoped by session so a shopper retrying the same client id is a
          // no-op, matching the widget's optimistic retry.
          externalMessageId: clientMessageId
            ? `${CHANNEL.SHOPIFY_CHAT}:${session.id}:${clientMessageId}`
            : null,
          isRealCustomerMessage: true,
        },
      );

      if (!result) {
        return res.status(200).json({ deduped: true });
      }

      // Bind the session to whichever thread won the create race, and re-bind
      // after a closed-thread rollover opens a new one.
      if (session.threadId !== result.thread.id || !session.customerId) {
        await db.storefrontChatSession.update({
          where: { id: session.id },
          data: {
            threadId: result.thread.id,
            customerId: result.thread.customerId,
            lastSeenAt: new Date(),
          },
        });
      }

      return res.status(202).json({ threadId: result.thread.id, isNewThread: result.isNew });
    } catch (err) {
      logger.error({ err, organizationId, sessionId }, '[StorefrontChat] Failed to persist shopper message');
      return res.status(500).json({ error: 'failed to persist message' });
    }
  });
}

const router = express.Router();
registerInternalStorefrontChatRoutes(router);
export default router;
