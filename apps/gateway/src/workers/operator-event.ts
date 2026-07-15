import { Worker } from 'bullmq';
import { db } from '@shopkeeper/db';
import type { OperatorEvent } from '@prisma/client';
import { QUEUE } from '../constants.js';
import logger from '../logger.js';
import { sendMessage } from '../clients/telegram-client.js';
import {
  claimOperatorEvent,
  finalizeOperatorEventCommitted,
  finalizeOperatorEventFailed,
  markOperatorEventReplyDelivered,
} from '../operator-event-store.js';
import {
  resolveBoundTelegramMember,
  runTelegramOperatorTurn,
} from '../routes/telegram/message-handler.js';
import type { TelegramReply } from '../routes/telegram/types.js';
import type { OperatorEventJobData } from '../types.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

export interface OperatorEventWorkerRegistrationOptions {
  workerOptions: SharedGatewayWorkerOptions;
}

function readTelegramMessageId(metadata: OperatorEvent['metadata']): number {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>).messageId;
    if (typeof value === 'number') return value;
  }
  return 0;
}

// Run one claimed Telegram operator event. Rebuilds the reply from the persisted
// chatId (no request-scoped closure) and captures delivery so a stuck
// confirmation can be re-sent later without re-running the side-effectful turn.
async function processTelegramOperatorEvent(event: OperatorEvent, claimToken: string): Promise<void> {
  // Re-validate ownership at claim time (P5-01): the binding may have been
  // revoked or reassigned between enqueue and processing. Never trust the org /
  // user parked on the event JSON.
  const member = await resolveBoundTelegramMember(event.chatId);
  if (
    !member
    || member.organizationId !== event.organizationId
    || member.clerkUserId !== event.clerkUserId
  ) {
    logger.warn(
      { operatorEventId: event.id, chatId: event.chatId },
      '[OperatorEvent] Binding no longer valid — dropping',
    );
    await finalizeOperatorEventFailed(event.id, claimToken, 'binding revoked or reassigned before processing');
    return;
  }

  const deliveredTexts: string[] = [];
  let deliveryFailed = false;
  const reply: TelegramReply = async (text) => {
    deliveredTexts.push(text);
    try {
      const ok = await sendMessage(event.chatId, text, { orgId: event.organizationId });
      if (!ok) deliveryFailed = true;
    } catch {
      deliveryFailed = true;
    }
  };

  try {
    await runTelegramOperatorTurn({
      organizationId: event.organizationId,
      clerkUserId: event.clerkUserId,
      chatId: event.chatId,
      body: event.body,
      messageId: readTelegramMessageId(event.metadata),
      reply,
    });
  } catch (err) {
    // Post-claim throw: the turn may have partially acted, so it is recorded and
    // never auto-replayed. Tell the merchant once.
    logger.error({ err, operatorEventId: event.id }, '[OperatorEvent] Operator turn failed');
    await finalizeOperatorEventFailed(event.id, claimToken, err instanceof Error ? err.message : String(err));
    await reply('An unexpected error occurred. Please try again.').catch(() => {});
    return;
  }

  await finalizeOperatorEventCommitted(event.id, claimToken, deliveredTexts.join('\n\n'));
  if (deliveredTexts.length > 0 && !deliveryFailed) {
    await markOperatorEventReplyDelivered(event.id);
  }
}

// Load, claim, and run one operator event. Pre-claim work (load + claim) may
// fail transiently and is safe to retry — nothing has run yet, so it propagates
// to the caller (BullMQ retries). Once claimed, the turn is single-use and never
// auto-replayed: a redelivery or crashed prior attempt short-circuits here.
export async function processOperatorEventById(operatorEventId: string): Promise<void> {
  const event = await db.operatorEvent.findUnique({ where: { id: operatorEventId } });
  if (!event) {
    logger.warn({ operatorEventId }, '[OperatorEvent] Event not found — dropping');
    return;
  }
  if (event.status !== 'pending') {
    // Redelivery, a crashed prior attempt (left claimed), or an already-final
    // event. Never re-run a claimed or terminal event.
    logger.info({ operatorEventId, status: event.status }, '[OperatorEvent] Not pending — skipping');
    return;
  }

  const claimed = await claimOperatorEvent(operatorEventId);
  if (!claimed?.claimToken) {
    logger.info({ operatorEventId }, '[OperatorEvent] Lost claim race — skipping');
    return;
  }

  if (claimed.channel === 'telegram') {
    await processTelegramOperatorEvent(claimed, claimed.claimToken);
  } else {
    logger.error(
      { operatorEventId, channel: claimed.channel },
      '[OperatorEvent] Unsupported channel',
    );
    await finalizeOperatorEventFailed(claimed.id, claimed.claimToken, `unsupported channel: ${claimed.channel}`);
  }
}

export function createOperatorEventWorker(
  options: OperatorEventWorkerRegistrationOptions,
): Worker<OperatorEventJobData> {
  const worker = new Worker<OperatorEventJobData>(
    QUEUE.OPERATOR_EVENT,
    (job) => processOperatorEventById(job.data.operatorEventId),
    options.workerOptions,
  );

  registerJobFailureLogging(worker, {
    logMessage: '[OperatorEvent] Job failed permanently',
    logFields: (job) => ({ jobId: job?.id }),
    failureExtra: (job) => ({
      jobId: job?.id,
      queue: QUEUE.OPERATOR_EVENT,
      operatorEventId: job?.data?.operatorEventId,
      organizationId: job?.data?.organizationId,
      attemptsMade: job?.attemptsMade,
    }),
  });

  return worker;
}
