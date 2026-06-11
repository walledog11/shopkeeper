import { sendChatAction, setMessageReaction } from '../../clients/telegram-client.js';
import logger from '../../logger.js';
import { buildProgressCopy, type ProgressContext } from './progress-copy.js';
import type { TelegramReply } from './types.js';

export const TYPING_REFRESH_MS = 4000;
export const PROGRESS_THRESHOLD_MS = 10000;
export const RECEIPT_REACTION_EMOJI = '👀';

export interface OperatorPresenceOptions {
  chatId: string;
  messageId?: number;
  progress: ProgressContext;
  reply: TelegramReply;
}

export async function withOperatorPresence<T>(
  opts: OperatorPresenceOptions,
  work: () => Promise<T>,
): Promise<T> {
  const { chatId, messageId, progress, reply } = opts;

  let progressSent = false;

  if (messageId != null) {
    setMessageReaction(chatId, messageId, RECEIPT_REACTION_EMOJI).catch((err) => {
      logger.debug({ err, chatId, messageId }, '[Telegram] Receipt reaction failed');
    });
  }

  const refreshTyping = () => {
    sendChatAction(chatId, 'typing').catch((err) => {
      logger.debug({ err, chatId }, '[Telegram] Typing indicator refresh failed');
    });
  };

  refreshTyping();
  const typingInterval = setInterval(refreshTyping, TYPING_REFRESH_MS);

  const progressTimer = setTimeout(() => {
    if (progressSent) return;
    progressSent = true;
    reply(buildProgressCopy(progress)).catch((err) => {
      logger.warn({ err, chatId }, '[Telegram] Progress message failed');
    });
  }, PROGRESS_THRESHOLD_MS);

  try {
    return await work();
  } finally {
    clearInterval(typingInterval);
    clearTimeout(progressTimer);
  }
}
