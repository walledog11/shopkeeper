import { getTelegramConfig } from './config/runtime-config.js';
import logger from './logger.js';
import type { OpsAlertCaptureContext, OpsAlertInput } from '@shopkeeper/agent/observability';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const SEND_TIMEOUT_MS = 5_000;

// The operator-facing tags. `extra` is deliberately excluded: it carries
// thread/org identifiers, and /health/queues was put behind auth for exactly
// that reason (AUD-017). An ops alert must not be the leak that route isn't.
const SAFE_TAGS = ['category', 'service', 'queue', 'provider', 'channel', 'tool'] as const;

const LEVEL_PREFIX: Record<string, string> = {
  info: 'INFO',
  warning: 'WARN',
  error: 'ERROR',
};

export function formatOpsAlertMessage(
  input: OpsAlertInput,
  scope: OpsAlertCaptureContext,
): string {
  const lines = [`[${LEVEL_PREFIX[scope.level] ?? scope.level.toUpperCase()}] ${input.message}`];

  const tags = SAFE_TAGS
    .map((key) => (scope.tags[key] ? `${key}=${scope.tags[key]}` : null))
    .filter((entry): entry is string => entry !== null);
  if (tags.length > 0) lines.push(tags.join(' '));

  if (input.error !== undefined) {
    const detail = input.error instanceof Error ? input.error.message : String(input.error);
    lines.push(detail.slice(0, 300));
  }

  return lines.join('\n');
}

/**
 * Best-effort ops-alert push to the operator's Telegram chat.
 *
 * Deliberately does not reuse `clients/telegram-client.sendMessage`: that path
 * reports its own failures through `recordProviderSendFailure`, which emits a
 * `provider_send` ops alert. Routing alerts through it would make a Telegram
 * outage produce alerts about Telegram, sent over Telegram. This sender records
 * nothing and never throws, so a dispatch failure can only ever cost one log
 * line — the alert is already durable in the log stream by the time we run.
 */
export async function dispatchOpsAlertToTelegram(
  input: OpsAlertInput,
  scope: OpsAlertCaptureContext,
  chatId: string,
): Promise<boolean> {
  const token = getTelegramConfig().botToken;
  if (!token) return false;

  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: formatOpsAlertMessage(input, scope) }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, '[OpsAlert] Telegram dispatch rejected');
      return false;
    }
    return true;
  } catch (error) {
    logger.warn({ err: (error as Error).message }, '[OpsAlert] Telegram dispatch errored');
    return false;
  }
}
