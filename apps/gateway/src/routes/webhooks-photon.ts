import type { Request, Response, Router } from 'express';
import { randomUUID } from 'crypto';
import type { Content, Message, Space, WebhookRawResult } from 'spectrum-ts';
import { getPlatformSpectrumApp, sendImessageOnSpace, SpectrumIntegrationConfigError } from '../clients/spectrum.js';
import logger from '../logger.js';
import { rateLimit, sendTooManyRequests } from '../rate-limit.js';
import { stripMarkdown } from '../message-handlers/strip-markdown.js';
import { ingestAndEnqueueOperatorEvent } from '../operator-event-ingest.js';
import { webhookJsonParser } from './body-parsers.js';
import { getRateLimitRedis } from './webhooks-shared.js';
import {
  handleImessageOperatorMessage,
  resolveImessageOperatorBinding,
} from './imessage/message-handler.js';
import type { OperatorReply } from './operator-message.js';
import {
  buildWebhookSignatureRequestMetadata,
  recordWebhookSignatureFailure,
} from './webhooks-signature-alerts.js';

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

// iMessage is operator-only: the merchant texts an instruction and the agent acts
// on it. Rich content is flattened to a text label for the operator handler — no
// org-scoped attachment persistence (the agent never consumes the bytes).
function normalizeContent(content: Content): string | null {
  switch (content.type) {
    case 'text':
      return safeTrim(content.text);
    case 'markdown':
      return safeTrim(content.markdown);
    case 'attachment':
      return `Attachment: ${content.name}`;
    case 'voice':
      return '[Voice message]';
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
    case 'group':
      return safeTrim(content.items.map((item) => normalizeContent(item.content)).filter(Boolean).join('\n'));
    case 'effect':
      return normalizeContent(content.content);
    case 'reply':
      return normalizeContent(content.content);
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

// Durable ingestion (P4-03): persist + enqueue the operator event before the
// turn runs, so an acknowledged instruction is recoverable and executed at most
// once. The DB unique key on (channel, providerMessageId) absorbs provider
// redeliveries. Errors propagate to the route so it returns a non-2xx and
// Photon redelivers; the unique key absorbs that redelivery. A message without a
// stable provider id can't be deduped durably, so it falls back to synchronous
// handling.
async function ingestInboundImessageMessage(
  space: Space,
  message: Message,
  traceId: string,
): Promise<void> {
  if (message.direction !== 'inbound') {
    logger.info(
      { messageId: message.id, direction: message.direction, traceId },
      '[Webhook] Photon non-inbound message skipped',
    );
    return;
  }

  const senderId = safeTrim(message.sender?.id);
  if (!senderId) {
    logger.warn({ messageId: message.id, traceId }, '[Webhook] Photon message missing sender id');
    return;
  }

  const externalSpaceId = safeTrim(space.id);
  if (!externalSpaceId) {
    logger.warn({ messageId: message.id, senderId, traceId }, '[Webhook] Photon message missing space id');
    return;
  }

  const body = safeTrim(normalizeContent(message.content));
  if (!body) {
    logger.info(
      { messageId: message.id, senderId, contentType: message.content.type, traceId },
      '[Webhook] Photon message has no persistable content',
    );
    return;
  }

  const reply: OperatorReply = async (replyText) => {
    await sendImessageOnSpace(space, stripMarkdown(replyText));
  };

  const providerMessageId = safeTrim(message.id);
  if (!providerMessageId) {
    // No stable provider id → can't dedupe a redelivery durably, so returning a
    // 500 would risk double-processing. Handle synchronously and swallow like the
    // sync path instead of propagating.
    logger.info(
      { senderId, externalSpaceId, traceId },
      '[Webhook] iMessage message missing provider id — processing synchronously',
    );
    try {
      await handleImessageOperatorMessage({ senderId, spaceId: externalSpaceId, body, displayName: null, reply });
    } catch (error) {
      logger.error({ err: error, traceId }, '[Webhook] iMessage operator dispatch failed');
    }
    return;
  }

  // Binding maintenance (connect-code, unbound reply, space refresh) stays
  // synchronous; only the operator turn is deferred to the worker.
  const member = await resolveImessageOperatorBinding({
    senderId,
    spaceId: externalSpaceId,
    body,
    displayName: null,
    reply,
  });
  if (!member) return;

  const { created } = await ingestAndEnqueueOperatorEvent({
    organizationId: member.organizationId,
    channel: 'imessage',
    providerMessageId: `imessage:${providerMessageId}`,
    chatId: senderId,
    spaceId: externalSpaceId,
    clerkUserId: member.clerkUserId,
    operatorKey: `imessage:${senderId}`,
    body,
  });

  logger.info(
    { senderId, messageId: providerMessageId, externalSpaceId, created, traceId },
    '[Webhook] iMessage durable operator event ingested',
  );
}

export function registerPhotonWebhookRoutes(router: Router): void {
  router.post('/photon', webhookJsonParser(), async (req: Request, res: Response) => {
    if (!req.rawBody) {
      logger.warn('[Webhook] Photon missing raw body — rejecting.');
      recordWebhookSignatureFailure(
        'photon',
        'missing_raw_body',
        {
          counterClient: getRateLimitRedis(),
          route: '/webhooks/photon',
          request: buildWebhookSignatureRequestMetadata(req),
        },
      ).catch((err) => logger.error({ err }, '[Webhook] Photon signature alert error'));
      return res.sendStatus(401);
    }

    try {
      const photonRateLimit = await rateLimit(getRateLimitRedis(), 'webhook:photon');
      if (!photonRateLimit.success) {
        logger.warn('[Webhook] Photon rate limit exceeded');
        return sendTooManyRequests(res, photonRateLimit.reset);
      }

      let app;
      try {
        app = await getPlatformSpectrumApp();
      } catch (error) {
        if (error instanceof SpectrumIntegrationConfigError) {
          logger.warn('[Webhook] Photon webhook received but iMessage is not configured');
          return res.sendStatus(503);
        }
        throw error;
      }

      const result = await app.webhook(
        { body: req.rawBody, headers: normalizeHeaders(req.headers) },
        async (space, message) => {
          const traceId = randomUUID();
          await ingestInboundImessageMessage(space, message, traceId);
        },
      );

      logger.info(
        {
          status: result.status,
          hasSignature: Boolean(req.headers['x-spectrum-signature']),
          ...(result.status !== 200
            ? { spectrumReason: new TextDecoder().decode(Buffer.from(result.body)) }
            : {}),
        },
        '[Webhook] Photon delivery processed',
      );

      if (result.status === 401) {
        const reason = req.headers['x-spectrum-signature'] ? 'signature_mismatch' : 'missing_signature';
        recordWebhookSignatureFailure(
          'photon',
          reason,
          {
            counterClient: getRateLimitRedis(),
            route: '/webhooks/photon',
            request: buildWebhookSignatureRequestMetadata(req),
          },
        ).catch((err) => logger.error({ err }, '[Webhook] Photon signature alert error'));
      }

      return sendSpectrumResult(res, result);
    } catch (error) {
      logger.error({ err: error }, '[Webhook] Photon webhook failed');
      return res.sendStatus(500);
    }
  });
}
