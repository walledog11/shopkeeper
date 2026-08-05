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
  // Durable operator-event UUID when this turn came through the queued P4-03
  // path. It becomes the AgentAction turnId for direct recovery correlation.
  turnId?: string;
}

/**
 * How long to wait before saying "working on it" in words.
 *
 * Telegram can afford 10s because its 👀 reaction and typing action land
 * instantly, so the merchant already knows the message arrived. A transport with
 * no such affordance has nothing on screen until this fires, and ten seconds of
 * silence reads as "the app didn't get my text" — so it speaks up quickly.
 */
export const PROGRESS_THRESHOLD_MS = 10000;
export const SILENT_CHANNEL_PROGRESS_THRESHOLD_MS = 2500;

// Minimal channel-agnostic presence: sends one "still working" reply if the work
// outlasts the threshold. Used by transports that lack a typing indicator.
export function progressOnlyPresence(
  reply: OperatorReply,
  thresholdMs: number = PROGRESS_THRESHOLD_MS,
): OperatorPresence {
  return async (progress, work) => {
    const timer = setTimeout(() => {
      reply(buildProgressCopy(progress)).catch((err) =>
        logger.warn({ err }, '[Operator] Progress message failed'),
      );
    }, thresholdMs);
    try {
      return await work();
    } finally {
      clearTimeout(timer);
    }
  };
}
