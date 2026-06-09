/**
 * Per-member operator notification routing.
 *
 * Sends the body to the member's bound Telegram chat and persists the matching
 * `OperatorContext` patch so the inbound webhook can resolve `pendingPlan` /
 * `pendingDigest` on the next reply.
 *
 * Notification policy:
 * - **critical** — plan approval prompts and escalations. Send failures throw
 *   `OperatorNotifyError` so BullMQ jobs retry; `provider_send` ops alerts are
 *   emitted from `telegram-client` on each failed attempt.
 * - **best-effort** — digests, auto-execution summaries, webhook replies, and
 *   auto-ack. Failures are logged and the caller continues without throwing.
 */

import logger from './logger.js';
import { isTelegramConfigured, sendMessage as telegramSend } from './clients/telegram-client.js';
import { updateContext, type OperatorContext } from './operator-context.js';

export type OperatorNotifyPolicy = 'critical' | 'best-effort';

export interface OperatorMember {
  chatId: string;
}

export interface OperatorNotifyOptions {
  policy?: OperatorNotifyPolicy;
  threadId?: string | null;
}

export interface OperatorNotifyResult {
  chatId: string;
}

export class OperatorNotifyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'OperatorNotifyError';
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

export async function notifyOperator(
  organizationId: string,
  member: OperatorMember,
  body: string,
  contextPatch: Partial<OperatorContext>,
  options: OperatorNotifyOptions = {},
): Promise<OperatorNotifyResult | null> {
  const policy = options.policy ?? 'best-effort';

  if (!isTelegramConfigured()) {
    if (policy === 'critical') {
      throw new OperatorNotifyError('Telegram not configured');
    }
    return null;
  }

  try {
    const sent = await telegramSend(member.chatId, body, {
      orgId: organizationId,
      threadId: options.threadId ?? null,
    });
    if (!sent) {
      if (policy === 'critical') {
        throw new OperatorNotifyError('Telegram send failed');
      }
      logger.warn(
        { chatId: member.chatId, organizationId },
        '[OperatorNotify] Telegram send failed — skipping context update',
      );
      return null;
    }

    await updateContext(organizationId, member.chatId, contextPatch);
    return { chatId: member.chatId };
  } catch (error) {
    if (policy === 'critical') {
      if (error instanceof OperatorNotifyError) {
        throw error;
      }
      throw new OperatorNotifyError('Telegram send failed', { cause: error });
    }

    logger.error(
      { err: (error as Error).message, chatId: member.chatId, organizationId },
      '[OperatorNotify] Telegram send failed',
    );
    return null;
  }
}
