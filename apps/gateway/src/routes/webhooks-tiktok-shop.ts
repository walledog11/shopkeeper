import type { Request, Response, Router } from 'express';
import { randomUUID } from 'crypto';
import { getTikTokShopWebhookConfig } from '../config/runtime-config.js';
import {
  normalizeTikTokShopWebhookPayload,
  verifyTikTokShopWebhookSignature,
} from '../clients/tiktok-shop.js';
import logger from '../logger.js';
import { CHANNEL, JOB } from '../constants.js';
import { rateLimit, sendTooManyRequests } from '../rate-limit.js';
import { webhookJsonParser } from './body-parsers.js';
import { getMessageQueue, getRateLimitRedis, resolveOrganizationId } from './webhooks-shared.js';
import {
  buildWebhookSignatureRequestMetadata,
  recordWebhookSignatureFailure,
} from './webhooks-signature-alerts.js';

export function registerTikTokShopWebhookRoutes(router: Router): void {
  router.post('/tiktok-shop', webhookJsonParser(), async (req: Request, res: Response) => {
    const config = getTikTokShopWebhookConfig();
    if (!config.enabled) {
      return res.sendStatus(404);
    }
    if (!config.secret) {
      logger.error('[Webhook] TIKTOK_SHOP_WEBHOOK_SECRET is not configured — rejecting.');
      return res.sendStatus(500);
    }

    const signatureHeader = req.headers[config.signatureHeader];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!signature || !req.rawBody) {
      logger.warn('[Webhook] TikTok Shop missing signature or raw body — rejecting.');
      recordWebhookSignatureFailure(
        'tiktok_shop',
        !signature ? 'missing_signature' : 'missing_raw_body',
        {
          counterClient: getRateLimitRedis(),
          route: '/webhooks/tiktok-shop',
          request: buildWebhookSignatureRequestMetadata(req),
        },
      ).catch((err) => logger.error({ err }, '[Webhook] TikTok Shop signature alert error'));
      return res.sendStatus(401);
    }

    if (!verifyTikTokShopWebhookSignature({ body: req.rawBody, config, signature })) {
      logger.warn('[Webhook] TikTok Shop signature mismatch — rejecting.');
      recordWebhookSignatureFailure(
        'tiktok_shop',
        'signature_mismatch',
        {
          counterClient: getRateLimitRedis(),
          route: '/webhooks/tiktok-shop',
          request: buildWebhookSignatureRequestMetadata(req),
        },
      ).catch((err) => logger.error({ err }, '[Webhook] TikTok Shop signature alert error'));
      return res.sendStatus(401);
    }

    const message = normalizeTikTokShopWebhookPayload(req.body, config.messageEventNames);
    if (!message || message.isEcho) {
      logger.info('[Webhook] TikTok Shop non-buyer-message event — skipping queue.');
      return res.status(200).send('OK');
    }

    try {
      const organizationId = await resolveOrganizationId(CHANNEL.TIKTOK, message.accountId);
      if (!organizationId) {
        logger.warn({ accountId: message.accountId }, '[Webhook] No TikTok Shop integration found — dropping.');
        return res.status(200).send('OK');
      }

      const tiktokRateLimit = await rateLimit(getRateLimitRedis(), `webhook:tiktok:${organizationId}`);
      if (!tiktokRateLimit.success) {
        logger.warn({ organizationId }, '[Webhook] TikTok Shop rate limit exceeded');
        return sendTooManyRequests(res, tiktokRateLimit.reset);
      }

      const traceId = randomUUID();
      await getMessageQueue().add(JOB.TIKTOK_SHOP, {
        platform: CHANNEL.TIKTOK,
        organizationId,
        rawPayload: req.body,
        inboundMessageId: message.messageId ? `tiktok:${message.accountId}:${message.messageId}` : null,
        traceId,
      });

      logger.info({ organizationId, traceId }, '[Webhook] TikTok Shop buyer message queued');
      return res.status(200).send('OK');
    } catch (error) {
      logger.error({ err: error }, '[Webhook] Failed to queue TikTok Shop message');
      return res.sendStatus(500);
    }
  });
}
