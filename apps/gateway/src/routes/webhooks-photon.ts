import type { Request, Response, Router } from 'express';
import { randomUUID } from 'crypto';
import { db, ChannelType } from '@shopkeeper/db';
import type { Content, Message, Space, WebhookRawResult } from 'spectrum-ts';
import { getSpectrumAppForIntegration } from '../clients/spectrum.js';
import logger from '../logger.js';
import { rateLimit, sendTooManyRequests } from '../rate-limit.js';
import { uploadInboundAttachment } from '../storage/blob.js';
import { stripMarkdown } from '../message-handlers/strip-markdown.js';
import { getRateLimitRedis } from './webhooks-shared.js';
import { handleImessageOperatorMessage } from './imessage/message-handler.js';
import type { OperatorReply } from './operator-message.js';
import {
  buildWebhookSignatureRequestMetadata,
  recordWebhookSignatureFailure,
} from './webhooks-signature-alerts.js';

type ReadableContent = Extract<Content, { type: 'attachment' | 'voice' }>;

interface NormalizedContent {
  text: string | null;
  attachmentUrls: string[];
}

function normalizeHeaders(headers: Request['headers']): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      normalized[key] = value;
    } else if (Array.isArray(value)) {
      normalized[key] = value.join(', ');
    }
  }
  return normalized;
}

function sendSpectrumResult(res: Response, result: WebhookRawResult): void {
  for (const [name, value] of Object.entries(result.headers)) {
    res.setHeader(name, value);
  }
  res.status(result.status).send(Buffer.from(result.body));
}

function safeTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function contactText(content: Extract<Content, { type: 'contact' }>): string {
  const name = content.name?.formatted
    ?? [content.name?.first, content.name?.last].filter(Boolean).join(' ').trim();
  const phones = content.phones?.map((phone) => phone.value).filter(Boolean) ?? [];
  const emails = content.emails?.map((email) => email.value).filter(Boolean) ?? [];
  const details = [name, ...phones, ...emails].filter((part): part is string => Boolean(part));
  return details.length > 0 ? `Contact: ${details.join(' ')}` : '[Contact]';
}

async function uploadReadableContent(
  organizationId: string,
  messageId: string,
  content: ReadableContent,
): Promise<string | null> {
  const buffer = await content.read();
  const fallbackExt = content.type === 'voice' ? 'm4a' : 'bin';
  const contentName = 'name' in content ? safeTrim(content.name) : null;
  const filename = contentName ?? `${content.type}-${messageId}.${fallbackExt}`;
  const contentType = safeTrim(content.mimeType) ?? 'application/octet-stream';
  return uploadInboundAttachment(
    organizationId,
    filename,
    contentType,
    Buffer.from(buffer).toString('base64'),
  );
}

async function normalizeContent(
  organizationId: string,
  messageId: string,
  content: Content,
  attachmentUrls: string[],
): Promise<string | null> {
  switch (content.type) {
    case 'text':
      return safeTrim(content.text);
    case 'markdown':
      return safeTrim(content.markdown);
    case 'attachment': {
      const url = await uploadReadableContent(organizationId, messageId, content);
      if (url) attachmentUrls.push(url);
      return `Attachment: ${content.name}`;
    }
    case 'voice': {
      const url = await uploadReadableContent(organizationId, messageId, content);
      if (url) attachmentUrls.push(url);
      return '[Voice message]';
    }
    case 'contact':
      return contactText(content);
    case 'richlink':
      return `Rich link: ${content.url}`;
    case 'reaction':
      return `Reaction: ${content.emoji}`;
    case 'poll':
      return `Poll: ${content.title}`;
    case 'poll_option':
      return `Poll option ${content.selected ? 'selected' : 'cleared'}: ${content.title}`;
    case 'custom':
      return '[Unsupported iMessage content: custom]';
    case 'group': {
      const parts = await Promise.all(
        content.items.map((item) => normalizeContent(organizationId, item.id, item.content, attachmentUrls)),
      );
      return safeTrim(parts.filter(Boolean).join('\n'));
    }
    case 'effect':
      return normalizeContent(organizationId, messageId, content.content, attachmentUrls);
    case 'reply':
      return normalizeContent(organizationId, messageId, content.content, attachmentUrls);
    case 'streamText':
    case 'typing':
    case 'rename':
    case 'avatar':
    case 'edit':
    case 'unsend':
    case 'read':
      return null;
    default:
      return null;
  }
}

async function normalizeMessageContent(
  organizationId: string,
  message: Message,
): Promise<NormalizedContent> {
  const attachmentUrls: string[] = [];
  const text = await normalizeContent(organizationId, message.id, message.content, attachmentUrls);
  return { text, attachmentUrls };
}

const IMESSAGE_DEDUPE_TTL_SECONDS = 300;

// Spectrum webhooks deliver at-least-once, so claim each provider message id
// before dispatching: an operator turn has real side effects (refunds, replies)
// and must never run twice on a redelivery or a Photon timeout-retry. Returns
// true on first delivery, false on a duplicate. Fails open on a Redis error —
// dropping a merchant instruction is worse than a rare duplicate.
async function claimImessageMessage(integrationId: string, messageId: string): Promise<boolean> {
  try {
    const claimed = await getRateLimitRedis().set(
      `imsg:op:${integrationId}:${messageId}`,
      '1',
      'EX',
      IMESSAGE_DEDUPE_TTL_SECONDS,
      'NX',
    );
    return claimed === 'OK';
  } catch (err) {
    logger.warn({ err, integrationId, messageId }, '[Webhook] iMessage dedupe check failed — processing anyway');
    return true;
  }
}

// iMessage is an operator channel: the merchant texts the org's dedicated Spectrum
// line and the operator agent replies synchronously. No customer ever reaches this
// path, so there is no ticket/customer persistence — dispatch straight to the
// operator handler, mirroring the Telegram webhook.
async function dispatchInboundImessageMessage(
  integration: { id: string; organizationId: string },
  space: Space,
  message: Message,
  traceId: string,
): Promise<void> {
  const { id: integrationId, organizationId } = integration;

  if (message.direction !== 'inbound') {
    logger.info(
      { organizationId, messageId: message.id, direction: message.direction, traceId },
      '[Webhook] Photon non-inbound message skipped',
    );
    return;
  }

  const senderId = safeTrim(message.sender?.id);
  if (!senderId) {
    logger.warn({ organizationId, messageId: message.id, traceId }, '[Webhook] Photon message missing sender id');
    return;
  }

  const externalSpaceId = safeTrim(space.id);
  if (!externalSpaceId) {
    logger.warn({ organizationId, messageId: message.id, senderId, traceId }, '[Webhook] Photon message missing space id');
    return;
  }

  const messageId = safeTrim(message.id);
  if (messageId && !(await claimImessageMessage(integrationId, messageId))) {
    logger.info({ organizationId, senderId, messageId, traceId }, '[Webhook] iMessage duplicate delivery skipped');
    return;
  }

  const { text, attachmentUrls } = await normalizeMessageContent(organizationId, message);
  const body = safeTrim(text) ?? (attachmentUrls.length > 0 ? '[Attachment]' : null);
  if (!body) {
    logger.info(
      { organizationId, messageId: message.id, senderId, contentType: message.content.type, traceId },
      '[Webhook] Photon message has no persistable content',
    );
    return;
  }

  const reply: OperatorReply = async (replyText) => {
    await space.send(stripMarkdown(replyText));
  };

  // Sender carries no display name inbound (User = { id }); binding label stays null.
  await handleImessageOperatorMessage({
    integrationId,
    organizationId,
    senderId,
    spaceId: externalSpaceId,
    body,
    displayName: null,
    reply,
  });

  logger.info(
    { organizationId, senderId, messageId: message.id, externalSpaceId, traceId },
    '[Webhook] iMessage operator handled',
  );
}

export function registerPhotonWebhookRoutes(router: Router): void {
  router.post('/photon/:integrationId', async (req: Request, res: Response) => {
    const integrationId = typeof req.params.integrationId === 'string' ? req.params.integrationId.trim() : '';

    if (!integrationId) {
      return res.sendStatus(404);
    }

    if (!req.rawBody) {
      logger.warn('[Webhook] Photon missing raw body — rejecting.');
      recordWebhookSignatureFailure(
        'photon',
        'missing_raw_body',
        {
          counterClient: getRateLimitRedis(),
          route: '/webhooks/photon/:integrationId',
          request: buildWebhookSignatureRequestMetadata(req),
        },
      ).catch((err) => logger.error({ err }, '[Webhook] Photon signature alert error'));
      return res.sendStatus(401);
    }

    try {
      const integration = await db.integration.findUnique({
        where: { id: integrationId },
        select: {
          id: true,
          organizationId: true,
          platform: true,
          externalAccountId: true,
          accessToken: true,
          refreshToken: true,
        },
      });

      if (!integration || integration.platform !== ChannelType.imessage) {
        logger.warn({ integrationId }, '[Webhook] Photon integration not found — rejecting.');
        return res.sendStatus(404);
      }

      const photonRateLimit = await rateLimit(getRateLimitRedis(), `webhook:photon:${integration.organizationId}`);
      if (!photonRateLimit.success) {
        logger.warn({ organizationId: integration.organizationId }, '[Webhook] Photon rate limit exceeded');
        return sendTooManyRequests(res, photonRateLimit.reset);
      }

      const app = await getSpectrumAppForIntegration(integration);
      const result = await app.webhook(
        { body: req.rawBody, headers: normalizeHeaders(req.headers) },
        async (space, message) => {
          const traceId = randomUUID();
          try {
            await dispatchInboundImessageMessage(integration, space, message, traceId);
          } catch (error) {
            logger.error({ err: error, integrationId, traceId }, '[Webhook] iMessage operator dispatch failed');
          }
        },
      );

      logger.info(
        { integrationId, status: result.status, hasSignature: Boolean(req.headers['x-spectrum-signature']) },
        '[Webhook] Photon delivery processed',
      );

      if (result.status === 401) {
        const reason = req.headers['x-spectrum-signature'] ? 'signature_mismatch' : 'missing_signature';
        recordWebhookSignatureFailure(
          'photon',
          reason,
          {
            counterClient: getRateLimitRedis(),
            route: '/webhooks/photon/:integrationId',
            request: buildWebhookSignatureRequestMetadata(req),
          },
        ).catch((err) => logger.error({ err }, '[Webhook] Photon signature alert error'));
      }

      return sendSpectrumResult(res, result);
    } catch (error) {
      logger.error({ err: error, integrationId }, '[Webhook] Photon webhook failed');
      return res.sendStatus(500);
    }
  });
}
