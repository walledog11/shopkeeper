import type { Request, Response, Router } from 'express';
import logger from '../logger.js';
import { isOperatorDurableQueueEnabled } from '../config/runtime-config.js';
import { ingestAndEnqueueOperatorEvent } from '../operator-event-ingest.js';
import { parseTelegramCommand } from './telegram/command-parser.js';
import {
  handleTelegramMessage,
  resolveBoundTelegramMember,
  TELEGRAM_UNBOUND_REPLY,
} from './telegram/message-handler.js';
import { handleStartBinding } from './telegram/start-binding.js';
import { validateTelegramWebhook, type ValidatedTelegramWebhook } from './telegram/webhook-validation.js';

// Durable ingestion (P4-03): resolve the binding, persist the operator event,
// enqueue it, then acknowledge. A failed persist/enqueue returns 500 so Telegram
// redelivers; the (channel, providerMessageId) unique key absorbs the redelivery
// and the re-enqueue heals a row whose first enqueue failed.
async function ingestTelegramOperatorEvent(
  webhook: ValidatedTelegramWebhook,
  res: Response,
): Promise<void> {
  const command = parseTelegramCommand(webhook.body);
  if (command.type === 'start') {
    res.status(200).send('OK');
    await handleStartBinding(webhook.chatId, command.token, webhook.metadata, webhook.reply);
    return;
  }

  const member = await resolveBoundTelegramMember(webhook.chatId);
  if (!member) {
    res.status(200).send('OK');
    logger.warn({ chatId: webhook.chatId }, '[Telegram] Unbound sender');
    await webhook.reply(TELEGRAM_UNBOUND_REPLY);
    return;
  }

  try {
    const { created } = await ingestAndEnqueueOperatorEvent({
      organizationId: member.organizationId,
      channel: 'telegram',
      providerMessageId: `telegram:${webhook.chatId}:${webhook.messageId}`,
      chatId: webhook.chatId,
      clerkUserId: member.clerkUserId,
      operatorKey: `telegram:${webhook.chatId}`,
      body: webhook.body,
      metadata: {
        messageId: webhook.messageId,
        ...(webhook.metadata.displayName ? { displayName: webhook.metadata.displayName } : {}),
        ...(webhook.metadata.username ? { username: webhook.metadata.username } : {}),
        ...(webhook.metadata.telegramUserId ? { telegramUserId: webhook.metadata.telegramUserId } : {}),
      },
    });
    if (!created) {
      logger.info(
        { chatId: webhook.chatId, messageId: webhook.messageId },
        '[Telegram] Operator event redelivery — ensuring enqueue',
      );
    }
    res.status(200).send('OK');
  } catch (error) {
    logger.error({ err: error, chatId: webhook.chatId }, '[Telegram] Durable operator ingest failed');
    res.sendStatus(500);
  }
}

export function registerTelegramWebhookRoutes(router: Router): void {
  router.post('/telegram', async (req: Request, res: Response) => {
    const webhook = await validateTelegramWebhook(req, res);
    if (!webhook) return;

    if (isOperatorDurableQueueEnabled('telegram')) {
      await ingestTelegramOperatorEvent(webhook, res);
      return;
    }

    // Synchronous path: acknowledge immediately so Telegram does not time out
    // during the LLM turn, then process in-process (non-durable, the fallback).
    res.status(200).send('OK');
    try {
      await handleTelegramMessage({
        chatId: webhook.chatId,
        metadata: webhook.metadata,
        messageId: webhook.messageId,
        body: webhook.body,
        reply: webhook.reply,
      });
    } catch (error) {
      logger.error({ err: error }, '[Telegram] Webhook error');
      await webhook.reply('An unexpected error occurred. Please try again.');
    }
  });
}
