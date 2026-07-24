import type { Request, Response, Router } from 'express';
import { createHash, randomUUID } from 'crypto';
import { db, EmailProvider } from '@shopkeeper/db';
import { getPostmarkWebhookConfig } from '../config/runtime-config.js';
import logger from '../logger.js';
import { CHANNEL, JOB } from '../constants.js';
import { safeEqual } from '../lib/crypto.js';
import { rateLimit, sendTooManyRequests } from '../rate-limit.js';
import { applyInboundAttachmentBudget } from '../storage/attachment-budget.js';
import { emailInboundJsonParser, emailInboundUrlencodedParser } from './body-parsers.js';
import { getMessageQueue, getRateLimitRedis } from './webhooks-shared.js';

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

function hasValidPostmarkAuth(req: Request): boolean {
  const { inboundUsername: expectedUser, inboundPassword: expectedPass } = getPostmarkWebhookConfig();
  if (!expectedUser || !expectedPass) {
    return !isProductionEnv();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const sep = decoded.indexOf(':');
  if (sep < 0) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  return safeEqual(user, expectedUser) && safeEqual(pass, expectedPass);
}

function normalizeEmailAddress(value: string): string {
  return value.replace(/.*<(.+)>/, '$1').trim().toLowerCase();
}

async function recordUnclaimedRecipient(recipient: string): Promise<void> {
  const normalized = normalizeEmailAddress(recipient);
  const recipientDomain = normalized.split('@')[1] || 'invalid';
  const recipientHash = createHash('sha256').update(normalized).digest('hex').slice(0, 16);

  logger.info(
    { event: 'unclaimed_recipient', recipientDomain, recipientHash },
    '[Webhook] Unclaimed Postmark recipient acknowledged',
  );
  try {
    const redis = getRateLimitRedis();
    const key = `metrics:postmark:unclaimed:${recipientDomain}:${recipientHash}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 86_400);
  } catch (error) {
    logger.warn(
      { err: error, event: 'unclaimed_recipient_counter_failed', recipientDomain, recipientHash },
      '[Webhook] Failed to count unclaimed Postmark recipient',
    );
  }
}

export function registerEmailWebhookRoutes(router: Router): void {
  router.post('/email/inbound', emailInboundJsonParser(), emailInboundUrlencodedParser(), async (req: Request, res: Response) => {
    if (!hasValidPostmarkAuth(req)) {
      logger.warn('[Webhook] Inbound email rejected — invalid or missing basic auth');
      res.set('WWW-Authenticate', 'Basic realm="postmark-inbound"');
      return res.sendStatus(401);
    }
    try {
      const rawFrom: string | undefined = req.body.From || req.body.from;
      const originalRecipient: string | undefined =
        req.body.OriginalRecipient || req.body.originalRecipient;
      const subject: string = req.body.Subject || req.body.subject || 'No Subject';
      const text: string | undefined = req.body.TextBody || req.body.text;
      const emailHeaders: Array<{ Name: string; Value: string }> = req.body.Headers || [];
      const msgIdHeader = emailHeaders.find(h => h.Name === 'Message-ID');
      const inboundMessageId: string | null = msgIdHeader?.Value || null;

      const rawAttachments: Array<{ Name?: string; Content?: string; ContentType?: string }> =
        Array.isArray(req.body.Attachments) ? req.body.Attachments : [];
      const { accepted: attachments, rejected } = applyInboundAttachmentBudget(
        rawAttachments
          .filter((a) => typeof a.Content === 'string' && a.Content.length > 0)
          .map((a) => ({
            name: typeof a.Name === 'string' && a.Name.length > 0 ? a.Name : 'attachment',
            contentType: typeof a.ContentType === 'string' ? a.ContentType : 'application/octet-stream',
            contentBase64: a.Content as string,
          })),
      );
      if (rejected.length > 0) {
        logger.warn(
          { rejected: rejected.map(({ name, reason, bytes }) => ({ name, reason, bytes })) },
          '[Webhook] Dropped inbound attachments over budget — message still delivered',
        );
      }

      if (!rawFrom || !text) {
        return res.sendStatus(400);
      }

      if (!originalRecipient) {
        await recordUnclaimedRecipient('missing@invalid');
        return res.status(200).send('OK');
      }

      const recipientAddress = normalizeEmailAddress(originalRecipient);
      const fromAddress = normalizeEmailAddress(rawFrom);
      const fromName = rawFrom.replace(/<.*>/, '').trim().replace(/"/g, '') || null;

      const localPart = recipientAddress.split('@')[0];
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!uuidRegex.test(localPart)) {
        await recordUnclaimedRecipient(recipientAddress);
        return res.status(200).send('OK');
      }

      const integration = await db.integration.findUnique({
        where: {
          organizationId_emailProvider: {
            organizationId: localPart,
            emailProvider: EmailProvider.postmark,
          },
        },
        select: { id: true, organizationId: true },
      });
      if (!integration) {
        await recordUnclaimedRecipient(recipientAddress);
        return res.status(200).send('OK');
      }
      const organizationId = integration.organizationId;

      const emailRateLimit = await rateLimit(getRateLimitRedis(), `webhook:email:${organizationId}`);
      if (!emailRateLimit.success) {
        logger.warn({ organizationId }, '[Webhook] Email rate limit exceeded');
        return sendTooManyRequests(res, emailRateLimit.reset);
      }

      const traceId = randomUUID();
      await getMessageQueue().add(JOB.EMAIL, {
        platform: CHANNEL.EMAIL,
        organizationId,
        integrationId: integration.id,
        receivedAt: new Date().toISOString(),
        senderEmail: fromAddress,
        senderName: fromName,
        subject,
        body: text,
        inboundMessageId,
        traceId,
        ...(attachments.length > 0 && { attachments }),
      });

      logger.info({ integrationId: integration.id, organizationId, traceId }, '[Webhook] Inbound email queued');
      return res.status(200).send('OK');
    } catch (error) {
      logger.error({ err: error }, '[Webhook] Failed to queue email');
      return res.sendStatus(500);
    }
  });
}
