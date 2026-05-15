import logger from '../logger.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

export interface TelegramSendOptions {
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  disableWebPagePreview?: boolean;
}

function getToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return token && token.length > 0 ? token : null;
}

export function isTelegramConfigured(): boolean {
  return getToken() !== null;
}

export async function sendMessage(
  chatId: string,
  text: string,
  opts?: TelegramSendOptions,
): Promise<void> {
  const token = getToken();
  if (!token) {
    logger.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — skipping sendMessage');
    return;
  }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };
  if (opts?.parseMode) body.parse_mode = opts.parseMode;
  if (opts?.disableWebPagePreview) body.disable_web_page_preview = true;

  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
  }

  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: secretToken,
      allowed_updates: ['message'],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Telegram setWebhook failed: ${res.status} ${errBody.slice(0, 300)}`);
  }
}
