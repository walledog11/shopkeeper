import type { DbChannelType } from '@shopkeeper/db';
import type { ConfirmedOrder } from '../../../storefront-chat-verified-orders.js';
import type { RequestDisplay } from '../../shared/request-display.js';
import { formatCardOpening } from './format-plan.js';
import type { ConversationStage } from './types.js';

// The question card opens like an approval card, so the two read as one
// colleague: who asked what, then the one fact needed, then the thread.
export function formatQuestionMessage(input: {
  customerName: string | null;
  channelType: DbChannelType;
  requestDisplay: RequestDisplay;
  question: string;
  stage: ConversationStage;
  verifiedOrders?: readonly ConfirmedOrder[];
  sourceMessageText?: string | null;
  threadLink?: string | null;
  now?: Date;
}): string {
  const { lines } = formatCardOpening({
    customerName: input.customerName,
    channelType: input.channelType,
    requestDisplay: input.requestDisplay,
    stage: input.stage,
    ...(input.now ? { now: input.now } : {}),
    ...(input.verifiedOrders ? { verifiedOrders: input.verifiedOrders } : {}),
    ...(input.sourceMessageText ? { sourceMessageText: input.sourceMessageText } : {}),
  });
  const closing = "I'll draft the reply once you tell me.";
  lines.push('', input.question, '', input.threadLink ? `${closing} (thread: ${input.threadLink})` : closing);
  return lines.join('\n');
}
