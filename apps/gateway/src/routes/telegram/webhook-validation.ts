import { timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { isTelegramConfigured, sendMessage } from '../../clients/telegram-client.js';
import logger from '../../logger.js';
import { rateLimit } from '../../rate-limit.js';
import {
  buildWebhookSignatureRequestMetadata,
  recordWebhookSignatureFailure,
} from '../webhooks-signature-alerts.js';
import { getRateLimitRedis } from '../webhooks-shared.js';
import type { TelegramReply, TelegramUpdate } from './types.js';

const TELEGRAM_PER_CHAT_LIMIT = 30;
const TELEGRAM_PER_CHAT_WINDOW_SECS = 60;

export interface ValidatedTelegramWebhook {
  body: string;
  chatId: string;
  reply: TelegramReply;
}

function createReply(chatId: string): TelegramReply {
  return async (text: string) => {
    try {
      await sendMessage(chatId, text);
    } catch (e) {
      logger.warn({ err: (e as Error).message }, '[Telegram] Failed to send message');
    }
  };
}

function secretsMatch(expectedSecret: string, incomingSecret: string): boolean {
  const expected = Buffer.from(expectedSecret, 'utf8');
  const incoming = Buffer.from(incomingSecret, 'utf8');
  return expected.length === incoming.length && timingSafeEqual(expected, incoming);
}

export async function validateTelegramWebhook(
  req: Request,
  res: Response,
): Promise<ValidatedTelegramWebhook | null> {
  if (!isTelegramConfigured()) {
    res.status(404).send('Not Found');
    return null;
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    logger.error('[Telegram] TELEGRAM_WEBHOOK_SECRET is not configured — rejecting.');
    res.status(500).send('Internal Server Error');
    return null;
  }

  const incomingSecret = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
  const alertDeps = () => ({
    counterClient: getRateLimitRedis(),
    route: '/webhooks/telegram',
    request: buildWebhookSignatureRequestMetadata(req),
  });

  if (!incomingSecret) {
    logger.warn('[Telegram] Missing secret token header — rejecting.');
    recordWebhookSignatureFailure('telegram', 'missing_signature', alertDeps())
      .catch((err) => logger.error({ err }, '[Telegram] Signature alert error'));
    res.status(403).send('Forbidden');
    return null;
  }

  if (!secretsMatch(expectedSecret, incomingSecret)) {
    logger.warn('[Telegram] Secret token mismatch — rejecting request.');
    recordWebhookSignatureFailure('telegram', 'signature_mismatch', alertDeps())
      .catch((err) => logger.error({ err }, '[Telegram] Signature alert error'));
    res.status(403).send('Forbidden');
    return null;
  }

  const message = (req.body as TelegramUpdate).message;
  if (!message?.text || !message.chat) {
    res.status(200).send('OK');
    return null;
  }

  const chatId = String(message.chat.id);
  const chatRateLimit = await rateLimit(
    getRateLimitRedis(),
    `webhook:telegram:${chatId}`,
    TELEGRAM_PER_CHAT_LIMIT,
    TELEGRAM_PER_CHAT_WINDOW_SECS,
  );
  if (!chatRateLimit.success) {
    logger.warn({ chatId }, '[Telegram] Per-chat rate limit exceeded — dropping');
    res.status(200).send('OK');
    return null;
  }

  const reply = createReply(chatId);
  if (message.chat.type !== 'private') {
    logger.info({ chatType: message.chat.type }, '[Telegram] Ignoring non-private chat');
    res.status(200).send('OK');
    await reply('Shopkeeper only works in 1:1 chats. Open a direct message with the bot.');
    return null;
  }

  const body = message.text.trim();
  if (!body) {
    res.status(200).send('OK');
    return null;
  }

  res.status(200).send('OK');
  return { body, chatId, reply };
}
