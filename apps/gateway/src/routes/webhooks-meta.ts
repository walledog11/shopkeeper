import type { Request, Response, Router } from 'express';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import { getInstagramWebhookConfig } from '../config/runtime-config.js';
import logger from '../logger.js';
import { JOB } from '../constants.js';
import { rateLimit } from '../rate-limit.js';
import type {
  InstagramInboundAttachment,
  InstagramInboundJobData,
} from '../types.js';
import { resolveActiveInstagramIntegration } from '../lib/instagram-integration.js';
import { webhookJsonParser } from './body-parsers.js';
import { getMessageQueue, getRateLimitRedis } from './webhooks-shared.js';
import {
  buildWebhookSignatureRequestMetadata,
  recordWebhookSignatureFailure,
} from './webhooks-signature-alerts.js';

interface NormalizedInstagramMessage {
  senderIgsid: string;
  externalMessageId: string | null;
  providerSentAt: string;
  text: string | null;
  attachments: InstagramInboundAttachment[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return value;
}

function readProviderTimestamp(value: unknown): string | null {
  let timestampMs: number;
  if (typeof value === 'number') {
    timestampMs = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    timestampMs = Number(value);
  } else if (typeof value === 'string') {
    timestampMs = Date.parse(value);
  } else {
    return null;
  }

  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return null;
  if (timestampMs < 1_000_000_000_000) timestampMs *= 1000;
  const timestamp = new Date(timestampMs);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

function normalizeAttachment(value: unknown): InstagramInboundAttachment | null {
  if (!isRecord(value)) return null;
  const payload = isRecord(value.payload) ? value.payload : null;
  return {
    type: readNonEmptyString(value.type) ?? 'unknown',
    url: readNonEmptyString(payload?.url) ?? readNonEmptyString(value.url),
  };
}

function normalizeInstagramMessage(value: unknown): NormalizedInstagramMessage | null {
  if (!isRecord(value) || !isRecord(value.sender) || !isRecord(value.message)) return null;

  const senderIgsid = readNonEmptyString(value.sender.id);
  const providerSentAt = readProviderTimestamp(value.timestamp);
  if (!senderIgsid || !providerSentAt) return null;

  const message = value.message;
  if (message.is_echo === true || message.is_self === true) return null;

  const attachments = Array.isArray(message.attachments)
    ? message.attachments
        .map(normalizeAttachment)
        .filter((attachment): attachment is InstagramInboundAttachment => attachment !== null)
    : [];

  if (Array.isArray(message.shares)) {
    for (const share of message.shares) {
      if (!isRecord(share)) continue;
      attachments.push({
        type: 'share',
        url: readNonEmptyString(share.link) ?? readNonEmptyString(share.url),
      });
    }
  }

  if (message.is_deleted === true) {
    attachments.push({ type: 'deleted', url: null });
  }

  const text = readNonEmptyString(message.text);
  if (!text && attachments.length === 0) {
    attachments.push({ type: 'unsupported', url: null });
  }

  return {
    senderIgsid,
    externalMessageId: readNonEmptyString(message.mid),
    providerSentAt,
    text,
    attachments,
  };
}

function signatureMatches(rawBody: Buffer, signature: string, appSecret: string): boolean {
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const trusted = Buffer.from(expected, 'utf8');
  const received = Buffer.from(signature, 'utf8');
  return trusted.length === received.length && timingSafeEqual(trusted, received);
}

export function registerMetaWebhookRoutes(router: Router): void {
  router.get('/meta', (req: Request, res: Response) => {
    const { verifyToken } = getInstagramWebhookConfig();

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
      if (mode === 'subscribe' && token === verifyToken) {
        logger.info('[Webhook] Instagram handshake successful');
        return res.status(200).send(challenge);
      }
      logger.warn('[Webhook] Instagram handshake failed: token mismatch');
      return res.sendStatus(403);
    }
    return res.sendStatus(400);
  });

  router.post('/meta', webhookJsonParser(), async (req: Request, res: Response) => {
    const { appSecret } = getInstagramWebhookConfig();
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    if (!appSecret) {
      logger.error('[Webhook] Instagram webhook signing secret is not configured — rejecting.');
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
      ).catch((err) => logger.error({ err }, '[Webhook] Instagram signature alert error'));
      return res.sendStatus(401);
    }
    if (!signatureMatches(req.rawBody, signature, appSecret)) {
      logger.warn('[Webhook] Signature mismatch — rejecting request.');
      recordWebhookSignatureFailure(
        'meta',
        'signature_mismatch',
        {
          counterClient: getRateLimitRedis(),
          route: '/webhooks/meta',
          request: buildWebhookSignatureRequestMetadata(req),
        },
      ).catch((err) => logger.error({ err }, '[Webhook] Instagram signature alert error'));
      return res.sendStatus(401);
    }

    const payload = req.body as { object?: unknown; entry?: unknown };
    if (payload.object !== 'instagram') return res.sendStatus(404);

    try {
      const jobs: Array<{ name: string; data: InstagramInboundJobData }> = [];
      const integrationCache = new Map<
        string,
        Awaited<ReturnType<typeof resolveActiveInstagramIntegration>>
      >();

      for (const entryValue of Array.isArray(payload.entry) ? payload.entry : []) {
        if (!isRecord(entryValue)) continue;
        const instagramAccountId = readNonEmptyString(entryValue.id);
        if (!instagramAccountId) {
          logger.warn('[Webhook] Instagram entry is missing an account id — skipping entry');
          continue;
        }

        const messages = (Array.isArray(entryValue.messaging) ? entryValue.messaging : [])
          .map(normalizeInstagramMessage)
          .filter((message): message is NormalizedInstagramMessage => message !== null);
        if (messages.length === 0) continue;

        let integration = integrationCache.get(instagramAccountId);
        if (integration === undefined) {
          integration = await resolveActiveInstagramIntegration(instagramAccountId);
          integrationCache.set(instagramAccountId, integration);
        }
        if (!integration) {
          logger.warn(
            { instagramAccountId },
            '[Webhook] No active Instagram Login integration for account — dropping events',
          );
          continue;
        }

        for (const message of messages) {
          const eventRateLimit = await rateLimit(
            getRateLimitRedis(),
            `webhook:ig:${integration.organizationId}`,
          );
          if (!eventRateLimit.success) {
            logger.warn(
              { organizationId: integration.organizationId },
              '[Webhook] Instagram event rate limit exceeded — dropping event',
            );
            continue;
          }

          const traceId = randomUUID();
          jobs.push({
            name: JOB.IG_DM,
            data: {
              platform: 'ig_dm',
              integrationId: integration.id,
              organizationId: integration.organizationId,
              instagramAccountId: integration.instagramAccountId,
              senderIgsid: message.senderIgsid,
              externalMessageId: message.externalMessageId,
              providerSentAt: message.providerSentAt,
              text: message.text,
              attachments: message.attachments,
              traceId,
            },
          });
        }
      }

      if (jobs.length > 0) {
        await getMessageQueue().addBulk(jobs);
        logger.info({ count: jobs.length }, '[Webhook] Instagram DM events queued');
      }
      return res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
      logger.error({ err: error }, '[Webhook] Failed to enqueue Instagram events');
      return res.sendStatus(500);
    }
  });
}
