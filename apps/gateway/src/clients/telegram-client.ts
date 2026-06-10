import { getTelegramConfig } from '../config/runtime-config.js';
import logger from '../logger.js';
import { recordProviderSendFailureInBackground } from '../provider-send-alerts.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

export interface TelegramSendAlertContext {
  orgId?: string | null;
  threadId?: string | null;
}

function getToken(): string | null {
  return getTelegramConfig().botToken;
}

export function isTelegramConfigured(): boolean {
  return getToken() !== null;
}

/** Returns true when Telegram accepted the message; false when skipped or HTTP-rejected. */
export async function sendMessage(
  chatId: string,
  text: string,
  alertContext?: TelegramSendAlertContext,
): Promise<boolean> {
  const token = getToken();
  if (!token) {
    logger.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — skipping sendMessage');
    return false;
  }

  try {
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
      recordProviderSendFailureInBackground('telegram', 'operator_notify', alertContext?.orgId ?? null, {
        threadId: alertContext?.threadId ?? null,
        detail: errBody.slice(0, 300) || `HTTP ${res.status}`,
        extra: { chatId, status: res.status },
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn(
      { err: (error as Error).message, chatId },
      '[Telegram] sendMessage errored',
    );
    recordProviderSendFailureInBackground('telegram', 'operator_notify', alertContext?.orgId ?? null, {
      threadId: alertContext?.threadId ?? null,
      detail: (error as Error).message,
      extra: { chatId },
    });
    throw error;
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
