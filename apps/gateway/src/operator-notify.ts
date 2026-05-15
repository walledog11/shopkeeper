/**
 * Per-member operator notification routing.
 *
 * Prefers Telegram over WhatsApp when both bindings exist on a member, then
 * persists the matching `OperatorContext` patch so the inbound webhook can
 * resolve `pendingPlan` / `pendingDigest` on the channel we actually sent on.
 */

import logger from './logger.js';
import { getTwilio } from './clients/twilio-client.js';
import { isTelegramConfigured, sendMessage as telegramSend } from './clients/telegram-client.js';
import { updateContext, type OperatorChannel, type OperatorContext } from './operator-context.js';

export interface OperatorMember {
  phoneNumber: string | null;
  phoneVerified: boolean;
  telegramChatId: string | null;
}

export interface OperatorNotifyResult {
  channel: OperatorChannel;
  chatId: string;
}

export async function notifyOperator(
  organizationId: string,
  member: OperatorMember,
  body: string,
  contextPatch: Partial<OperatorContext>,
): Promise<OperatorNotifyResult | null> {
  if (member.telegramChatId && isTelegramConfigured()) {
    try {
      await telegramSend(member.telegramChatId, body);
      await updateContext(organizationId, 'telegram', member.telegramChatId, contextPatch);
      return { channel: 'telegram', chatId: member.telegramChatId };
    } catch (e) {
      logger.error(
        { err: (e as Error).message, chatId: member.telegramChatId, organizationId },
        '[OperatorNotify] Telegram send failed',
      );
      return null;
    }
  }

  if (member.phoneVerified && member.phoneNumber) {
    const tw = getTwilio();
    if (!tw) return null;
    try {
      await tw.client.messages.create({
        from: tw.from,
        to: `whatsapp:${member.phoneNumber}`,
        body,
      });
      await updateContext(organizationId, 'whatsapp', member.phoneNumber, contextPatch);
      return { channel: 'whatsapp', chatId: member.phoneNumber };
    } catch (e) {
      logger.error(
        { err: (e as Error).message, phone: member.phoneNumber, organizationId },
        '[OperatorNotify] WhatsApp send failed',
      );
      return null;
    }
  }

  return null;
}
