import type { Request, Response, Router } from 'express';
import { randomUUID, timingSafeEqual } from 'crypto';
import { db } from '@clerk/db';
import logger from '../logger.js';
import { CHANNEL, JOB } from '../constants.js';
import { rateLimit, sendTooManyRequests } from '../rate-limit.js';
import { getMessageQueue, getRateLimitRedis } from './webhooks-shared.js';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function hasValidPostmarkAuth(req: Request): boolean {
  const expectedUser = process.env.POSTMARK_INBOUND_USERNAME;
  const expectedPass = process.env.POSTMARK_INBOUND_PASSWORD;
  if (!expectedUser || !expectedPass) return true;

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

export function registerEmailWebhookRoutes(router: Router): void {
  router.post('/email/inbound', async (req: Request, res: Response) => {
    if (!hasValidPostmarkAuth(req)) {
      logger.warn('[Webhook] Inbound email rejected — invalid or missing basic auth');
      res.set('WWW-Authenticate', 'Basic realm="postmark-inbound"');
      return res.sendStatus(401);
    }
    try {
      const rawFrom: string | undefined = req.body.From || req.body.from;
      const to: string | undefined = req.body.To || req.body.to;
      const subject: string = req.body.Subject || req.body.subject || 'No Subject';
      const text: string | undefined = req.body.TextBody || req.body.text;
      const emailHeaders: Array<{ Name: string; Value: string }> = req.body.Headers || [];
      const msgIdHeader = emailHeaders.find(h => h.Name === 'Message-ID');
      const inboundMessageId: string | null = msgIdHeader?.Value || null;

      const rawAttachments: Array<{ Name?: string; Content?: string; ContentType?: string }> =
        Array.isArray(req.body.Attachments) ? req.body.Attachments : [];
      const attachments = rawAttachments
        .filter((a) => typeof a.Content === 'string' && a.Content.length > 0)
        .map((a) => ({
          name: typeof a.Name === 'string' && a.Name.length > 0 ? a.Name : 'attachment',
          contentType: typeof a.ContentType === 'string' ? a.ContentType : 'application/octet-stream',
          contentBase64: a.Content as string,
        }));

      if (!rawFrom || !text) {
        return res.sendStatus(400);
      }

      if (!to) {
        logger.warn('[Webhook] Inbound email missing To address — cannot route to org.');
        return res.sendStatus(400);
      }

      const toAddress = to.replace(/.*<(.+)>/, '$1').trim().toLowerCase();
      const fromAddress = rawFrom.replace(/.*<(.+)>/, '$1').trim();
      const fromName = rawFrom.replace(/<.*>/, '').trim().replace(/"/g, '') || null;

      const localPart = toAddress.split('@')[0];
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      let organizationId: string;

      if (uuidRegex.test(localPart)) {
        const org = await db.organization.findUnique({
          where: { id: localPart },
          select: { id: true },
        });
        if (!org) {
          logger.warn({ localPart }, '[Webhook] No organization found for id — dropping.');
          return res.status(200).send('OK');
        }
        organizationId = localPart;
      } else {
        const integration = await db.integration.findFirst({
          where: { platform: CHANNEL.EMAIL, externalAccountId: { equals: toAddress, mode: 'insensitive' } },
          select: { organizationId: true },
        });
        if (!integration) {
          logger.warn({ toAddress }, '[Webhook] No email integration found for address — dropping.');
          return res.status(200).send('OK');
        }
        organizationId = integration.organizationId;
      }

      const emailRateLimit = await rateLimit(getRateLimitRedis(), `webhook:email:${organizationId}`);
      if (!emailRateLimit.success) {
        logger.warn({ organizationId }, '[Webhook] Email rate limit exceeded');
        return sendTooManyRequests(res, emailRateLimit.reset);
      }

      const traceId = randomUUID();
      await getMessageQueue().add(JOB.EMAIL, {
        platform: CHANNEL.EMAIL,
        organizationId,
        senderEmail: fromAddress,
        senderName: fromName,
        subject,
        body: text,
        inboundMessageId,
        traceId,
        ...(attachments.length > 0 && { attachments }),
      });

      logger.info({ fromAddress, organizationId, traceId }, '[Webhook] Inbound email queued');
      return res.status(200).send('OK');
    } catch (error) {
      logger.error({ err: error }, '[Webhook] Failed to queue email');
      return res.sendStatus(500);
    }
  });
}