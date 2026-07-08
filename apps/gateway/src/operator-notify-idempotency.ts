import { createHash } from 'node:crypto';
import { getGatewayRedis } from './clients/redis-client.js';
import logger from './logger.js';
import type { OperatorBinding } from './operator-notify.js';

// BullMQ processing queues retry up to 3× with exponential backoff (~35s window).
// spectrum-ts@4.2.0 does not expose clientGuid on space.send(), so per-channel Redis
// keys substitute for transport-level dedupe on proactive operator sends.
const OPERATOR_NOTIFY_DEDUPE_TTL_SECONDS = 60 * 60;

function redisKey(
  channel: OperatorBinding['channel'],
  contextKey: string,
  idempotencyKey: string,
): string {
  return `op:notify:${channel}:${contextKey}:${idempotencyKey}`;
}

export function hashOperatorNotifyContent(parts: string[]): string {
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

export function digestNotificationIdempotencyKey(
  organizationId: string,
  sentAt: string,
): string {
  return hashOperatorNotifyContent([organizationId, 'digest', sentAt]);
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
