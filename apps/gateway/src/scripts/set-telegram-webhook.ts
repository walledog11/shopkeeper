/**
 * Register the Telegram bot webhook URL with the Bot API.
 *
 * Usage (from apps/gateway/):
 *   tsx src/scripts/set-telegram-webhook.ts <webhook-url>
 *
 * Example:
 *   tsx src/scripts/set-telegram-webhook.ts https://gateway.clerk.app/webhooks/telegram
 *
 * Env vars required:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
 */

import { loadGatewayEnv } from '../config/load-env.js';
loadGatewayEnv();

import { setWebhook } from '../clients/telegram-client.js';

const url = process.argv[2];
if (!url) {
  console.error('Usage: tsx src/scripts/set-telegram-webhook.ts <webhook-url>');
  process.exit(1);
}

const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!secret) {
  console.error('TELEGRAM_WEBHOOK_SECRET must be set');
  process.exit(1);
}

setWebhook(url, secret)
  .then(() => {
    console.log(`Telegram webhook registered → ${url}`);
  })
  .catch((err: Error) => {
    console.error('Failed to register Telegram webhook:', err.message);
    process.exit(1);
  });
