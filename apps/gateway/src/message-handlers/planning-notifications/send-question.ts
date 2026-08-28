import type { DbChannelType } from '@shopkeeper/db';
import logger from '../../logger.js';
import {
  questionNotificationIdempotencyKey,
} from '../../operator-notify-idempotency.js';
import { listOperatorBindings } from '../../operator-notify.js';
import { removePendingPlanForThread } from '../../operator-context.js';
import { getConversationStage } from './conversation-stage.js';
import { notifyCriticalToAllOperators } from './delivery.js';
import { formatQuestionMessage } from './format-question.js';

// Soft sibling of sendOperatorPlanNotification: the agent needs one fact from the
// merchant to finish the ticket. Pushes the question and parks `pendingQuestion`
// on each operator context so the next free-text reply is ingested as the answer.
export async function sendOperatorQuestionNotification(
  organizationId: string,
  threadId: string,
  customerName: string | null,
  channelType: DbChannelType,
  requestSummary: string | null,
  question: string,
  instruction: string,
  options?: {
    planId?: string | null;
    sourceMessageId?: string | null;
  },
): Promise<void> {
  const bindings = await listOperatorBindings(organizationId);

  if (bindings.length === 0) {
    logger.info({ organizationId }, '[Worker] No bound operator members — skipping question notification');
    return;
  }

  const summary = requestSummary || instruction;
  const stage = await getConversationStage(threadId);
  const message = formatQuestionMessage(customerName, channelType, summary, question, stage);
  const idempotencyKey = questionNotificationIdempotencyKey(organizationId, threadId, question);

  // This thread's plan (if any) is superseded by the question. Remove only its
  // entry across devices — a whole-queue clear would drop other threads' plans.
  await removePendingPlanForThread(organizationId, threadId);

  await notifyCriticalToAllOperators(
    organizationId,
    bindings,
    async () => ({
      body: message,
      contextPatch: {
        pendingQuestion: {
          threadId,
          question,
          ...(options?.planId ? { planId: options.planId } : {}),
          ...(options?.sourceMessageId ? { sourceMessageId: options.sourceMessageId } : {}),
        },
      },
      idempotencyKey,
    }),
    threadId,
    'Question notification',
  );
}
