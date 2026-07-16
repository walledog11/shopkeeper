import type { OperatorEvent } from '@prisma/client';
import { sendMessage } from './clients/telegram-client.js';
import { sendImessageToSpace } from './clients/spectrum.js';
import { stripMarkdown } from './message-handlers/strip-markdown.js';

// Deliver one operator reply on the event's own channel, returning true when the
// provider accepted it. Used both by the operator-event worker (the live turn's
// reply) and the recovery sweep (re-sending a committed-but-undelivered
// confirmation), so per-channel send formatting lives in one place. The worker
// reconstructs the target from the persisted row — chatId for Telegram, the
// bound space for iMessage — with no request-scoped handle.
export async function sendOperatorEventReply(event: OperatorEvent, text: string): Promise<boolean> {
  if (event.channel === 'telegram') {
    return sendMessage(event.chatId, text, { orgId: event.organizationId });
  }

  if (event.channel === 'imessage') {
    if (!event.spaceId) return false;
    try {
      await sendImessageToSpace(event.spaceId, stripMarkdown(text), { orgId: event.organizationId });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
