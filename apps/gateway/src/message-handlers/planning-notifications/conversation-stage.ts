import { getConversationBurst } from '../conversation-burst.js';
import type { ConversationStage } from './types.js';

export const FRESH_STAGE: ConversationStage = { isFollowUp: false, newMessages: 1 };

// Fresh conversation vs. ongoing chain, counted off the same burst the request
// summariser reads. The count floors at 1: when the shop had the last word the
// burst is empty, but the notification still describes one arriving message.
export async function getConversationStage(threadId: string): Promise<ConversationStage> {
  const burst = await getConversationBurst(threadId);
  return {
    isFollowUp: burst.isFollowUp,
    newMessages: Math.max(burst.messages.length, 1),
  };
}
