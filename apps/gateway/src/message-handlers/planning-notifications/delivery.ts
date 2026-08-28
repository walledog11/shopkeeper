import logger from '../../logger.js';
import {
  bindingDeliveryKey,
  notifyOperator,
  OperatorNotifyError,
  type OperatorBinding,
  type OperatorNotifyOptions,
} from '../../operator-notify.js';
import type { OperatorNotificationExclude } from './types.js';

// Excludes the one device the merchant just answered on, not the person: their
// other bound transport still gets the card, because it is not showing this
// exchange.
function shouldExcludeMember(
  member: OperatorBinding,
  exclude: OperatorNotificationExclude | undefined,
): boolean {
  if (!exclude || member.channel !== exclude.channel) return false;
  return bindingDeliveryKey(member) === exclude.deliveryKey;
}

// Critical fan-out: continue after per-channel failures so a BullMQ retry does not
// re-text channels that already succeeded. Fail only when every channel fails.
export async function notifyCriticalToAllOperators(
  organizationId: string,
  bindings: OperatorBinding[],
  notify: (member: OperatorBinding) => Promise<{
    body: string;
    contextPatch: Parameters<typeof notifyOperator>[3];
    idempotencyKey: string;
    appendPlan?: OperatorNotifyOptions['appendPlan'];
  }>,
  threadId: string,
  logLabel: string,
  exclude?: OperatorNotificationExclude,
): Promise<void> {
  let delivered = 0;
  let lastError: unknown;

  for (const member of bindings) {
    if (shouldExcludeMember(member, exclude)) continue;

    const { body, contextPatch, idempotencyKey, appendPlan } = await notify(member);
    try {
      const result = await notifyOperator(organizationId, member, body, contextPatch, {
        policy: 'critical',
        threadId,
        idempotencyKey,
        ...(appendPlan ? { appendPlan } : {}),
      });
      if (result) {
        delivered += 1;
        logger.info(
          { organizationId, threadId, chatId: result.chatId, channel: result.channel },
          `[Worker] ${logLabel} sent`,
        );
      } else {
        logger.warn(
          { organizationId, threadId, chatId: bindingDeliveryKey(member), channel: member.channel },
          `[Worker] ${logLabel} failed`,
        );
      }
    } catch (error) {
      lastError = error;
      logger.error(
        {
          err: (error as Error).message,
          organizationId,
          threadId,
          chatId: bindingDeliveryKey(member),
          channel: member.channel,
        },
        `[Worker] ${logLabel} failed`,
      );
    }
  }

  if (delivered === 0) {
    if (lastError instanceof OperatorNotifyError) {
      throw lastError;
    }
    throw new OperatorNotifyError(`${logLabel} failed on all operator channels`, { cause: lastError });
  }
}
