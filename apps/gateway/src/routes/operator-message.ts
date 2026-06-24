import logger from '../logger.js';
import { buildProgressCopy, type ProgressContext } from './telegram/progress-copy.js';

export type OperatorReply = (text: string) => Promise<void>;

// Wraps a unit of agent work with channel-appropriate "working on it" feedback.
// Telegram backs this with chat actions + a 👀 reaction; transports without those
// affordances use progressOnlyPresence (a single delayed reply).
export type OperatorPresence = <T>(progress: ProgressContext, work: () => Promise<T>) => Promise<T>;

// Channel-neutral inbound operator message. The shared command handlers operate
// on this shape; each transport (Telegram, iMessage) constructs it from its own
// webhook payload.
export interface OperatorMessageContext {
  chatId: string;
  body: string;
  reply: OperatorReply;
  presence: OperatorPresence;
  // Stable operator reference for thread resolution / audit, e.g. `telegram:<id>`.
  senderRef: string;
}

const PROGRESS_THRESHOLD_MS = 10000;

// Minimal channel-agnostic presence: sends one "still working" reply if the work
// outlasts the threshold. Used by transports that lack a typing indicator.
export function progressOnlyPresence(reply: OperatorReply): OperatorPresence {
  return async (progress, work) => {
    const timer = setTimeout(() => {
      reply(buildProgressCopy(progress)).catch((err) =>
        logger.warn({ err }, '[Operator] Progress message failed'),
      );
    }, PROGRESS_THRESHOLD_MS);
    try {
      return await work();
    } finally {
      clearTimeout(timer);
    }
  };
}
