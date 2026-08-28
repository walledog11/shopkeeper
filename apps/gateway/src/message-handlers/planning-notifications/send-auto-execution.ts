import type { DbChannelType } from '@shopkeeper/db';
import { memberOperatorKey } from '@shopkeeper/agent/internal-thread';
import logger from '../../logger.js';
import {
  autoExecutionNotificationIdempotencyKey,
} from '../../operator-notify-idempotency.js';
import {
  bindingDeliveryKey,
  listOperatorBindings,
  notifyOperator,
} from '../../operator-notify.js';
import { resolvePendingPlanContexts } from '../../operator-context.js';
import type { PrecomputedPlanResult } from '../planning-types.js';
import { formatAutoExecutionMessage } from './format-auto-execution.js';

export async function sendOperatorAutoExecutionNotification(
  organizationId: string,
  threadId: string,
  customerName: string | null,
  channelType: DbChannelType,
  requestSummary: string | null,
  result: PrecomputedPlanResult,
): Promise<void> {
  try {
    const bindings = await listOperatorBindings(organizationId);

    if (bindings.length === 0) {
      logger.info({ organizationId }, '[Worker] No bound operator members — skipping auto-execution notification');
      return;
    }

    const summary = requestSummary || result.instruction;
    const message = formatAutoExecutionMessage(customerName, channelType, summary, result.plan, result);

    const idempotencyKey = autoExecutionNotificationIdempotencyKey(
      organizationId,
      threadId,
      result.instruction,
    );

    if (result.identity) {
      await resolvePendingPlanContexts(
        organizationId,
        memberOperatorKey(bindings[0]!.orgMemberId),
        {
          threadId,
          instruction: result.instruction,
          rawToolCalls: result.plan.rawToolCalls,
          ...result.identity,
        },
      );
    }

    for (const member of bindings) {
      try {
        // Matching parked state was resolved conditionally above. Do not let a
        // late auto-execution notice erase an unrelated newer plan.
        const sent = await notifyOperator(organizationId, member, message, {}, { idempotencyKey });
        if (sent) {
          logger.info(
            { organizationId, threadId, chatId: sent.chatId, channel: sent.channel },
            '[Worker] Auto-execution notification sent',
          );
        } else {
          logger.warn(
            { organizationId, threadId, chatId: bindingDeliveryKey(member), channel: member.channel },
            '[Worker] Auto-execution notification failed',
          );
        }
      } catch (error) {
        logger.error(
          {
            err: (error as Error).message,
            organizationId,
            threadId,
            chatId: bindingDeliveryKey(member),
            channel: member.channel,
          },
          '[Worker] Auto-execution notification failed',
        );
      }
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, threadId }, '[Worker] sendOperatorAutoExecutionNotification error');
  }
}
