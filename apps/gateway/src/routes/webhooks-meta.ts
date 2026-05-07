import type { Request, Response, Router } from 'express';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import logger from '../logger.js';
import { CHANNEL, JOB } from '../constants.js';
import { rateLimit, sendTooManyRequests } from '../rate-limit.js';
import { getMessageQueue, getRateLimitRedis, resolveOrganizationId } from './webhooks-shared.js';
import {
  buildWebhookSignatureRequestMetadata,
  recordWebhookSignatureFailure,
} from './webhooks-signature-alerts.js';

export function registerMetaWebhookRoutes(router: Router): void {
  router.get('/meta', (req: Request, res: Response) => {
    const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        logger.info('[Webhook] Meta handshake successful');
        return res.status(200).send(challenge);
      } else {
        logger.warn('[Webhook] Meta handshake failed: token mismatch');
        return res.sendStatus(403);
      }
    }
    return res.sendStatus(400);
  });

  router.post('/meta', async (req: Request, res: Response) => {
    const APP_SECRET = process.env.META_APP_SECRET;
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    if (!APP_SECRET) {
      logger.error('[Webhook] META_APP_SECRET is not configured — rejecting.');
      return res.sendStatus(500);
    }
    if (!signature || !req.rawBody) {
      logger.warn('[Webhook] Missing signature or raw body — rejecting.');
      recordWebhookSignatureFailure(
        'meta',
        !signature ? 'missing_signature' : 'missing_raw_body',
        {
          counterClient: getRateLimitRedis(),
          route: '/webhooks/meta',
          request: buildWebhookSignatureRequestMetadata(req),
        },
      ).catch((err) => logger.error({ err }, '[Webhook] Meta signature alert error'));
      return res.sendStatus(401);
    }
    const expected = `sha256=${createHmac('sha256', APP_SECRET).update(req.rawBody).digest('hex')}`;
    const trusted = Buffer.from(expected, 'utf8');
    const received = Buffer.from(signature, 'utf8');
    if (trusted.length !== received.length || !timingSafeEqual(trusted, received)) {
      logger.warn('[Webhook] Signature mismatch — rejecting request.');
      recordWebhookSignatureFailure(
        'meta',
        'signature_mismatch',
        {
          counterClient: getRateLimitRedis(),
          route: '/webhooks/meta',
          request: buildWebhookSignatureRequestMetadata(req),
        },
      ).catch((err) => logger.error({ err }, '[Webhook] Meta signature alert error'));
      return res.sendStatus(401);
    }

    const payload = req.body as {
      object?: string;
      entry?: Array<{
        id?: string;
        messaging?: Array<{ message?: unknown }>;
        changes?: Array<{ value?: { message?: unknown } }>;
      }>;
    };

    if (payload.object === 'page' || payload.object === 'instagram') {
      try {
        const recipientPageId = payload.entry?.[0]?.id;

        if (!recipientPageId || recipientPageId === '0') {
          logger.warn('[Webhook] IG payload missing or placeholder entry[0].id — dropping.');
          return res.status(200).send('EVENT_RECEIVED');
        }

        const hasRealMessage =
          payload.entry?.[0]?.messaging?.[0]?.message ||
          payload.entry?.[0]?.changes?.[0]?.value?.message;
        if (!hasRealMessage) {
          logger.info('[Webhook] IG test/echo event — skipping queue.');
          return res.status(200).send('EVENT_RECEIVED');
        }

        const organizationId = await resolveOrganizationId(CHANNEL.IG_DM, recipientPageId);

        if (!organizationId) {
          logger.warn({ recipientPageId }, '[Webhook] No integration for IG page id — dropping.');
          return res.status(200).send('EVENT_RECEIVED');
        }

        const igRateLimit = await rateLimit(getRateLimitRedis(), `webhook:ig:${organizationId}`);
        if (!igRateLimit.success) {
          logger.warn({ organizationId }, '[Webhook] IG rate limit exceeded');
          return sendTooManyRequests(res, igRateLimit.reset);
        }

        const traceId = randomUUID();
        await getMessageQueue().add(JOB.IG_DM, {
          platform: CHANNEL.IG_DM,
          organizationId,
          rawPayload: payload,
          traceId,
        });

        logger.info({ organizationId, traceId }, '[Webhook] IG DM queued');
        return res.status(200).send('EVENT_RECEIVED');
      } catch (error) {
        logger.error({ err: error }, '[Webhook] Failed to add IG job to queue');
        return res.sendStatus(500);
      }
    }

    return res.sendStatus(404);
  });
}
