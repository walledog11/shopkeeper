/**
 * Per-member operator notification routing.
 *
 * Sends the body to the member's bound Telegram chat and persists the matching
 * `OperatorContext` patch so the inbound webhook can resolve `pendingPlan` /
 * `pendingDigest` on the next reply.
 */

import logger from './logger.js';
import { isTelegramConfigured, sendMessage as telegramSend } from './clients/telegram-client.js';
import { updateContext, type OperatorContext } from './operator-context.js';

export interface OperatorMember {
  chatId: string;
}

export interface OperatorNotifyResult {
  chatId: string;
}

export async function notifyOperator(
  organizationId: string,
  member: OperatorMember,
  body: string,
  contextPatch: Partial<OperatorContext>,
): Promise<OperatorNotifyResult | null> {
  if (!isTelegramConfigured()) return null;

  try {
    await telegramSend(member.chatId, body);
    await updateContext(organizationId, member.chatId, contextPatch);
    return { chatId: member.chatId };
  } catch (e) {
    logger.error(
      { err: (e as Error).message, chatId: member.chatId, organizationId },
      '[OperatorNotify] Telegram send failed',
    );
    return null;
  }
}
