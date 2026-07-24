import { randomUUID } from 'node:crypto';
import type { Request, Response, Router } from 'express';
import { OAuth2Client, type LoginTicket } from 'google-auth-library';
import { db } from '@shopkeeper/db';
import { decodeGmailBase64Url, getEmailProvider, isValidGmailHistoryId, readGmailHistoryId } from '@shopkeeper/email';
import {
  getGmailPubSubPushConfig,
  isGmailNativeInboundEnabled,
  type GmailPubSubPushConfig,
} from '../config/runtime-config.js';
import { JOB } from '../constants.js';
import logger from '../logger.js';
import type { GmailSyncJobData } from '../types.js';
import { isRecord } from '../lib/typing.js';
import { webhookJsonParser } from './body-parsers.js';
import { getGmailSyncQueue } from './webhooks-shared.js';

const GOOGLE_TOKEN_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

type GoogleTokenVerifier = {
  verifyIdToken(options: { idToken: string; audience: string }): Promise<LoginTicket>;
};

export interface GmailPushNotification {
  emailAddress: string;
  historyId: string;
  messageId: string;
}

export class GmailPushPayloadError extends Error {}
export class GmailPushAuthenticationError extends Error {}

function readBearerToken(req: Request): string | null {
  const authorization = req.headers.authorization;
  if (!authorization) return null;
  return /^Bearer ([^\s]+)$/i.exec(authorization.trim())?.[1] ?? null;
}

function decodePubSubMessageData(data: string): unknown {
  let decoded: Buffer;
  try {
    // Gmail push notifications use base64url in production.
    decoded = decodeGmailBase64Url(data);
  } catch {
    if (!data || data.length % 4 !== 0 || !BASE64_PATTERN.test(data)) {
      throw new GmailPushPayloadError('Pub/Sub message data is not valid base64');
    }
    decoded = Buffer.from(data, 'base64');
  }

  try {
    return JSON.parse(decoded.toString('utf8')) as unknown;
  } catch {
    throw new GmailPushPayloadError('Pub/Sub message data is not valid JSON');
  }
}

export function parseGmailPubSubEnvelope(body: unknown): GmailPushNotification {
  if (!isRecord(body) || !isRecord(body.message)) {
    throw new GmailPushPayloadError('Invalid Pub/Sub envelope');
  }
  if (typeof body.subscription !== 'string' || body.subscription.trim().length === 0) {
    throw new GmailPushPayloadError('Pub/Sub subscription is missing');
  }

  const rawMessageId = body.message.messageId ?? body.message.message_id;
  const data = body.message.data;
  const messageId = typeof rawMessageId === 'string' ? rawMessageId.trim() : '';
  if (!messageId || typeof data !== 'string') {
    throw new GmailPushPayloadError('Pub/Sub message fields are missing');
  }

  const notification = decodePubSubMessageData(data);
  if (!isRecord(notification)) {
    throw new GmailPushPayloadError('Invalid Gmail notification');
  }

  const emailAddress = typeof notification.emailAddress === 'string'
    ? notification.emailAddress.trim().toLowerCase()
    : '';
  const historyId = readGmailHistoryId(notification.historyId);
  if (!EMAIL_ADDRESS_PATTERN.test(emailAddress) || !isValidGmailHistoryId(historyId)) {
    throw new GmailPushPayloadError('Invalid Gmail notification fields');
  }

  return { emailAddress, historyId, messageId: messageId.trim() };
}

export async function verifyGmailPushToken(
  token: string,
  config: GmailPubSubPushConfig,
  verifier: GoogleTokenVerifier = new OAuth2Client(),
): Promise<void> {
  let ticket: LoginTicket;
  try {
    ticket = await verifier.verifyIdToken({
      idToken: token,
      audience: config.audience,
    });
  } catch {
    throw new GmailPushAuthenticationError('Google token verification failed');
  }

  const payload = ticket.getPayload();
  if (
    !payload
    || !GOOGLE_TOKEN_ISSUERS.has(payload.iss)
    || payload.aud !== config.audience
    || payload.email_verified !== true
    || payload.email?.toLowerCase() !== config.serviceAccountEmail.toLowerCase()
  ) {
    throw new GmailPushAuthenticationError('Google token claims are invalid');
  }
}

function gmailSyncJobId(integrationId: string, historyId: string): string {
  return `gmail-sync-${integrationId}-${historyId}`;
}

export function registerGmailWebhookRoutes(router: Router): void {
  router.post('/gmail/push', webhookJsonParser(), async (req: Request, res: Response) => {
    if (!isGmailNativeInboundEnabled()) {
      logger.info('[Gmail Push] Native inbound is disabled; notification acknowledged');
      return res.sendStatus(204);
    }

    const token = readBearerToken(req);
    if (!token) {
      logger.warn('[Gmail Push] Rejected request with missing bearer token');
      res.set('WWW-Authenticate', 'Bearer');
      return res.sendStatus(401);
    }

    const config = getGmailPubSubPushConfig();
    if (!config) {
      logger.error('[Gmail Push] OIDC verification is not configured');
      return res.sendStatus(503);
    }

    try {
      await verifyGmailPushToken(token, config);
    } catch {
      logger.warn('[Gmail Push] Rejected request with invalid bearer token');
      res.set('WWW-Authenticate', 'Bearer');
      return res.sendStatus(401);
    }

    let notification: GmailPushNotification;
    try {
      notification = parseGmailPubSubEnvelope(req.body);
    } catch {
      logger.warn('[Gmail Push] Rejected malformed Pub/Sub payload');
      return res.sendStatus(400);
    }

    try {
      const candidates = await db.integration.findMany({
        where: {
          platform: 'email',
          externalAccountId: {
            equals: notification.emailAddress,
            mode: 'insensitive',
          },
        },
        select: { id: true, metadata: true },
      });
      const integrations = candidates.filter((integration) =>
        getEmailProvider(integration) === 'gmail');

      if (integrations.length === 0) {
        logger.info(
          { emailAddress: notification.emailAddress, pubSubMessageId: notification.messageId },
          '[Gmail Push] Acknowledged notification for unknown mailbox',
        );
        return res.sendStatus(204);
      }

      const traceId = randomUUID();
      const queue = getGmailSyncQueue();
      await Promise.all(integrations.map(async (integration) => {
        const jobData: GmailSyncJobData = {
          integrationId: integration.id,
          notifiedHistoryId: notification.historyId,
          traceId,
        };
        await queue.add(JOB.GMAIL_SYNC, jobData, {
          jobId: gmailSyncJobId(integration.id, notification.historyId),
        });
      }));

      logger.info(
        {
          integrationCount: integrations.length,
          pubSubMessageId: notification.messageId,
          traceId,
        },
        '[Gmail Push] Sync work queued',
      );
      return res.sendStatus(204);
    } catch (error) {
      logger.error(
        { err: error, pubSubMessageId: notification.messageId },
        '[Gmail Push] Failed to durably queue sync work',
      );
      return res.sendStatus(500);
    }
  });
}
