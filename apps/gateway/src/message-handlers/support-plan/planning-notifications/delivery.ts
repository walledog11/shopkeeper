import logger from '../../../logger.js';
import {
  bindingDeliveryKey,
  notifyOperator,
  OperatorNotifyError,
  type OperatorBinding,
  type OperatorNotifyOptions,
} from '../../../operator-notify.js';
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
    images?: OperatorNotifyOptions['images'];
    /** The card to send instead when the one carrying `images` fails. */
    withoutImages?: {
      body: string;
      idempotencyKey: string;
      appendPlan?: OperatorNotifyOptions['appendPlan'];
    };
  }>,
  threadId: string,
  logLabel: string,
  exclude?: OperatorNotificationExclude,
): Promise<void> {
  let delivered = 0;
  let lastError: unknown;

  for (const member of bindings) {
    if (shouldExcludeMember(member, exclude)) continue;

    const { body, contextPatch, idempotencyKey, appendPlan, images, withoutImages } = await notify(member);
    const send = (card: {
      body: string;
      idempotencyKey: string;
      appendPlan?: OperatorNotifyOptions['appendPlan'];
      images?: OperatorNotifyOptions['images'];
    }) => notifyOperator(organizationId, member, card.body, contextPatch, {
      policy: 'critical',
      threadId,
      idempotencyKey: card.idempotencyKey,
      ...(card.appendPlan ? { appendPlan: card.appendPlan } : {}),
      ...(card.images?.length ? { images: card.images } : {}),
    });
    try {
      let result;
      try {
        result = await send({ body, idempotencyKey, appendPlan, images });
      } catch (error) {
        // A provider can refuse a photo on every attempt, so a card that must
        // carry photos would never arrive. Send the card that says it cannot
        // show them, which also re-parks the plan behind the thread review.
        if (!withoutImages) throw error;
        logger.warn(
          { err: (error as Error).message, organizationId, threadId, channel: member.channel },
          `[Worker] ${logLabel} photos failed; sending it without them`,
        );
        result = await send(withoutImages);
      }
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
