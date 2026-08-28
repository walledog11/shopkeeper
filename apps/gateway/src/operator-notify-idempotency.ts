import { createHash } from 'node:crypto';
import { getGatewayRedis } from './clients/redis-client.js';
import logger from './logger.js';
import type { OperatorBinding } from './operator-notify.js';

// BullMQ processing queues retry up to 3× with exponential backoff (~35s window).
// Spectrum does not expose a stable provider idempotency key on space.send(), so
// per-channel Redis keys substitute for transport-level dedupe on proactive sends.
const OPERATOR_NOTIFY_DEDUPE_TTL_SECONDS = 60 * 60;

function redisKey(
  channel: OperatorBinding['channel'],
  contextKey: string,
  idempotencyKey: string,
): string {
  return `op:notify:${channel}:${contextKey}:${idempotencyKey}`;
}

function hashOperatorNotifyContent(parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 32);
}

export function planNotificationIdempotencyKey(
  organizationId: string,
  threadId: string,
  rawToolCalls: unknown,
  instruction: string,
): string {
  return hashOperatorNotifyContent([
    organizationId,
    'plan',
    threadId,
    instruction,
    JSON.stringify(rawToolCalls),
  ]);
}

export function questionNotificationIdempotencyKey(
  organizationId: string,
  threadId: string,
  question: string,
): string {
  return hashOperatorNotifyContent([organizationId, 'question', threadId, question]);
}

export function escalationNotificationIdempotencyKey(
  organizationId: string,
  threadId: string,
  reason: string,
): string {
  return hashOperatorNotifyContent([organizationId, 'escalation', threadId, reason]);
}

/**
 * Keyed by send *window* (`digestWindowKey`), never by the send timestamp: a
 * per-invocation stamp mints a new key on every retry, which is the one case
 * this dedupe exists to cover.
 */
export function digestNotificationIdempotencyKey(
  organizationId: string,
  digestWindow: string,
): string {
  return hashOperatorNotifyContent([organizationId, 'digest', digestWindow]);
}

export function autoExecutionNotificationIdempotencyKey(
  organizationId: string,
  threadId: string,
  instruction: string,
): string {
  return hashOperatorNotifyContent([organizationId, 'auto_execution', threadId, instruction]);
}

export async function wasOperatorNotifyDelivered(
  channel: OperatorBinding['channel'],
  contextKey: string,
  idempotencyKey: string,
): Promise<boolean> {
  try {
    const exists = await getGatewayRedis().exists(redisKey(channel, contextKey, idempotencyKey));
    return exists === 1;
  } catch (err) {
    logger.warn(
      { err, channel, contextKey },
      '[OperatorNotify] Idempotency check failed — sending anyway',
    );
    return false;
  }
}

export async function markOperatorNotifyDelivered(
  channel: OperatorBinding['channel'],
  contextKey: string,
  idempotencyKey: string,
): Promise<void> {
  try {
    await getGatewayRedis().set(
      redisKey(channel, contextKey, idempotencyKey),
      '1',
      'EX',
      OPERATOR_NOTIFY_DEDUPE_TTL_SECONDS,
    );
  } catch (err) {
    logger.warn(
      { err, channel, contextKey },
      '[OperatorNotify] Idempotency mark failed',
    );
  }
}
