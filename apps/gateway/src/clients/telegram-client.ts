import logger from '../logger.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

function getToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return token && token.length > 0 ? token : null;
}

export function isTelegramConfigured(): boolean {
  return getToken() !== null;
}

export async function sendMessage(chatId: string, text: string): Promise<void> {
  const token = getToken();
  if (!token) {
    logger.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — skipping sendMessage');
    return;
  }

  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    logger.warn(
      { status: res.status, chatId, body: errBody.slice(0, 300) },
      '[Telegram] sendMessage failed',
    );
  }
}

export async function setWebhook(url: string, secretToken: string): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');

  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: secretToken, allowed_updates: ['message'] }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Telegram setWebhook failed: ${res.status} ${errBody.slice(0, 300)}`);
  }
}
