import type { Request, Response, Router } from 'express';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import { db } from '@shopkeeper/db';
import { isOrderRiskMonitorEnabled } from '../config/runtime-config.js';
import logger from '../logger.js';
import { CHANNEL, JOB } from '../constants.js';
import { rateLimit, sendTooManyRequests } from '../rate-limit.js';
import { getMessageQueue, getOrderReviewQueue, getRateLimitRedis, resolveOrganizationId } from './webhooks-shared.js';
import {
  buildWebhookSignatureRequestMetadata,
  recordWebhookSignatureFailure,
} from './webhooks-signature-alerts.js';

const SHOPIFY_SUPPORTED_TOPICS = new Set(['orders/created', 'orders/fulfilled', 'orders/updated', 'orders/cancelled']);

export function registerShopifyWebhookRoutes(router: Router): void {
  router.post('/shopify', async (req: Request, res: Response) => {
    const APP_SECRET = process.env.SHOPIFY_APP_SECRET;
    const signature = req.headers['x-shopify-hmac-sha256'] as string | undefined;

    if (!APP_SECRET) {
      logger.error('[Webhook] SHOPIFY_APP_SECRET is not configured — rejecting.');
      return res.sendStatus(500);
    }
    if (!signature || !req.rawBody) {
      logger.warn('[Webhook] Shopify missing signature or raw body — rejecting.');
      recordWebhookSignatureFailure(
        'shopify',
        !signature ? 'missing_signature' : 'missing_raw_body',
        {
          counterClient: getRateLimitRedis(),
          route: '/webhooks/shopify',
          request: buildWebhookSignatureRequestMetadata(req),
        },
      ).catch((err) => logger.error({ err }, '[Webhook] Shopify signature alert error'));
      return res.sendStatus(401);
    }
    const expected = createHmac('sha256', APP_SECRET).update(req.rawBody).digest('base64');
    const trusted = Buffer.from(expected, 'utf8');
    const received = Buffer.from(signature, 'utf8');
    if (trusted.length !== received.length || !timingSafeEqual(trusted, received)) {
      logger.warn('[Webhook] Shopify signature mismatch — rejecting.');
      recordWebhookSignatureFailure(
        'shopify',
        'signature_mismatch',
        {
          counterClient: getRateLimitRedis(),
          route: '/webhooks/shopify',
          request: buildWebhookSignatureRequestMetadata(req),
        },
      ).catch((err) => logger.error({ err }, '[Webhook] Shopify signature alert error'));
      return res.sendStatus(401);
    }

    const topic = req.headers['x-shopify-topic'] as string | undefined;
    const shopDomain = req.headers['x-shopify-shop-domain'] as string | undefined;
    const webhookIdHeader = req.headers['x-shopify-webhook-id'];
    const webhookId = (Array.isArray(webhookIdHeader) ? webhookIdHeader[0] : webhookIdHeader)?.trim();

    if (topic === 'app/uninstalled') {
      if (!shopDomain) {
        logger.warn('[Webhook] Shopify uninstall missing shop domain header — dropping.');
        return res.sendStatus(400);
      }
      try {
        const result = await db.integration.deleteMany({
          where: { platform: CHANNEL.SHOPIFY, externalAccountId: shopDomain },
        });
        logger.info(
          { shopDomain, deleted: result.count },
          '[Webhook] Shopify app uninstalled — integration removed',
        );
        return res.status(200).send('OK');
      } catch (error) {
        logger.error(
          { err: error, shopDomain },
          '[Webhook] Failed to remove Shopify integration on uninstall',
        );
        return res.sendStatus(500);
      }
    }

    if (!topic || !SHOPIFY_SUPPORTED_TOPICS.has(topic)) {
      return res.status(200).send('OK');
    }

    if (!shopDomain) {
      logger.warn('[Webhook] Shopify missing shop domain header — dropping.');
      return res.sendStatus(400);
    }

    try {
      const organizationId = await resolveOrganizationId(CHANNEL.SHOPIFY, shopDomain);
      if (!organizationId) {
        logger.warn({ shopDomain }, '[Webhook] No Shopify integration found — dropping.');
        return res.status(200).send('OK');
      }

      const shopifyRateLimit = await rateLimit(getRateLimitRedis(), `webhook:shopify:${organizationId}`);
      if (!shopifyRateLimit.success) {
        logger.warn({ organizationId }, '[Webhook] Shopify rate limit exceeded');
        return sendTooManyRequests(res, shopifyRateLimit.reset);
      }

      const traceId = randomUUID();
      await getMessageQueue().add(JOB.SHOPIFY, {
        platform: CHANNEL.SHOPIFY,
        organizationId,
        topic,
        rawPayload: req.body,
        inboundMessageId: webhookId ? `shopify:${shopDomain}:${webhookId}` : null,
        traceId,
      });

      // Order-ops (module #2): a new order also enters the risk-review queue.
      // Flag-gated; the stable jobId dedupes webhook retries so each order is
      // reviewed once. The per-order agent run happens in-process in the worker.
      const orderId = (req.body as { id?: number | string } | undefined)?.id;
      if (topic === 'orders/created' && isOrderRiskMonitorEnabled() && orderId != null) {
        await getOrderReviewQueue().add(
          JOB.ORDER_REVIEW,
          { organizationId, orderId: String(orderId), traceId },
          { jobId: `order-review:${shopDomain}:${orderId}` },
        );
      }

      logger.info({ organizationId, topic, traceId }, '[Webhook] Shopify order event queued');
      return res.status(200).send('OK');
    } catch (error) {
      logger.error({ err: error }, '[Webhook] Failed to queue Shopify event');
      return res.sendStatus(500);
    }
  });
}
