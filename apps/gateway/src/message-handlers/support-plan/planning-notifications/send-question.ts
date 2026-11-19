import type { DbChannelType } from '@shopkeeper/db';
import logger from '../../../logger.js';
import {
  questionNotificationIdempotencyKey,
} from '../../../operator-notify-idempotency.js';
import { listOperatorBindings } from '../../../operator-notify.js';
import { emailWorkspaceNotice } from '../../../operator-email.js';
import { removePendingPlanForThread } from '../../../operator-context.js';
import { getGatewayDashboardUrl } from '../../../config/env.js';
import { loadCardOpening } from './card-context.js';
import { notifyCriticalToAllOperators } from './delivery.js';
import { formatQuestionMessage } from './format-question.js';
import { formatTicketEmail } from './format-email.js';

// Soft sibling of sendOperatorPlanNotification: the agent needs one fact from the
// merchant to finish the ticket. Pushes the question and parks `pendingQuestion`
// on each operator context so the next free-text reply is ingested as the answer.
export async function sendOperatorQuestionNotification(
  organizationId: string,
  threadId: string,
  customerName: string | null,
  channelType: DbChannelType,
  // The card opens from the structured request, as the approval card does.
  _requestSummary: string | null,
  question: string,
  _instruction: string,
  options?: {
    planId?: string | null;
    sourceMessageId?: string | null;
    /** As for the plan card: the merchant asked in the app and is looking at it. */
    startedByMerchant?: boolean;
  },
): Promise<void> {
  const bindings = await listOperatorBindings(organizationId);

  if (bindings.length === 0 && options?.startedByMerchant) {
    logger.info({ organizationId }, '[Worker] No bound operator members — skipping question notification');
    return;
  }

  const opening = await loadCardOpening({
    organizationId,
    threadId,
    customerName,
    channelType,
    sourceMessageId: options?.sourceMessageId,
  });
  const idempotencyKey = questionNotificationIdempotencyKey(organizationId, threadId, question);
  if (bindings.length === 0) {
    await emailWorkspaceNotice(organizationId, {
      ...formatTicketEmail(opening, { kind: 'question', question }),
      threadId,
      idempotencyKey,
    });
    return;
  }
  const message = formatQuestionMessage({
    ...opening,
    question,
    threadLink: `${getGatewayDashboardUrl()}/dashboard/tickets?thread=${threadId}`,
  });

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
