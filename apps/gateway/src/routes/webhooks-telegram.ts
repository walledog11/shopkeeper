import type { Request, Response, Router } from 'express';
import logger from '../logger.js';
import { handleTelegramMessage } from './telegram/message-handler.js';
import { validateTelegramWebhook } from './telegram/webhook-validation.js';

export function registerTelegramWebhookRoutes(router: Router): void {
  router.post('/telegram', async (req: Request, res: Response) => {
    const webhook = await validateTelegramWebhook(req, res);
    if (!webhook) return;

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
