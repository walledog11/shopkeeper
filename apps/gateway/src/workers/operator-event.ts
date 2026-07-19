import { Worker } from 'bullmq';
import { db } from '@shopkeeper/db';
import type { OperatorEvent } from '@prisma/client';
import { QUEUE } from '../constants.js';
import logger from '../logger.js';
import {
  claimOperatorEvent,
  finalizeOperatorEventCommitted,
  finalizeOperatorEventFailed,
  markOperatorEventReplyDelivered,
} from '../operator-event-store.js';
import { sendOperatorEventReply } from '../operator-event-reply.js';
import {
  resolveBoundTelegramMember,
  runTelegramOperatorTurn,
} from '../routes/telegram/message-handler.js';
import {
  resolveBoundImessageMember,
  runImessageOperatorTurn,
} from '../routes/imessage/message-handler.js';
import type { OperatorEventJobData } from '../types.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

type OperatorEventReply = (text: string) => Promise<void>;

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

// Shared commit/deliver lifecycle for a claimed operator event. Runs the turn
// with a reply that both delivers and records each message, then records the
// committed outcome plus reply text. Delivery is tracked separately from turn
// commit so a stuck confirmation can be re-sent later (by the recovery sweep)
// without re-running the side-effectful turn.
async function runClaimedOperatorTurn(
  event: OperatorEvent,
  claimToken: string,
  runTurn: (reply: OperatorEventReply) => Promise<void>,
): Promise<void> {
  const deliveredTexts: string[] = [];
  let deliveryFailed = false;
  let deliveryUnknown = false;
  const reply: OperatorEventReply = async (text) => {
    deliveredTexts.push(text);
    const delivery = await sendOperatorEventReply(event, text);
    if (delivery === false) deliveryFailed = true;
    if (delivery === 'unknown') deliveryUnknown = true;
  };

  try {
    await runTurn(reply);
  } catch (err) {
    // Post-claim throw: the turn may have partially acted, so it is recorded and
    // never auto-replayed. Tell the merchant once.
    logger.error({ err, operatorEventId: event.id }, '[OperatorEvent] Operator turn failed');
    await finalizeOperatorEventFailed(event.id, claimToken, err instanceof Error ? err.message : String(err));
    await reply('An unexpected error occurred. Please try again.').catch(() => {});
    return;
  }

  await finalizeOperatorEventCommitted(event.id, claimToken, deliveredTexts.join('\n\n'), {
    replyDeliveryUnknown: deliveryUnknown,
  });
  if (deliveredTexts.length > 0 && !deliveryFailed && !deliveryUnknown) {
    await markOperatorEventReplyDelivered(event.id);
  }
}

// Re-validate ownership at claim time (P5-01): the binding may have been revoked
// or reassigned between enqueue and processing. Never trust the org / user parked
// on the event JSON. Returns false (and records the drop) when it no longer holds.
async function operatorBindingStillValid(event: OperatorEvent, claimToken: string): Promise<boolean> {
  const member = event.channel === 'telegram'
    ? await resolveBoundTelegramMember(event.chatId)
    : await resolveBoundImessageMember(event.chatId);
  if (
    !member
    || member.organizationId !== event.organizationId
    || member.clerkUserId !== event.clerkUserId
  ) {
    logger.warn(
      { operatorEventId: event.id, chatId: event.chatId, channel: event.channel },
      '[OperatorEvent] Binding no longer valid — dropping',
    );
    await finalizeOperatorEventFailed(event.id, claimToken, 'binding revoked or reassigned before processing');
    return false;
  }
  return true;
}

// Run one claimed Telegram operator event. Rebuilds the turn from the persisted
// chatId — no request-scoped closure.
async function processTelegramOperatorEvent(event: OperatorEvent, claimToken: string): Promise<void> {
  if (!(await operatorBindingStillValid(event, claimToken))) return;
  await runClaimedOperatorTurn(event, claimToken, (reply) =>
    runTelegramOperatorTurn({
      organizationId: event.organizationId,
      clerkUserId: event.clerkUserId,
      chatId: event.chatId,
      body: event.body,
      messageId: readTelegramMessageId(event.metadata),
      reply,
      turnId: event.id,
    }),
  );
}

// Run one claimed iMessage operator event. Rebuilds the reply from the persisted
// space (via sendOperatorEventReply), so nothing request-scoped is carried.
async function processImessageOperatorEvent(event: OperatorEvent, claimToken: string): Promise<void> {
  if (!event.spaceId) {
    logger.error({ operatorEventId: event.id }, '[OperatorEvent] iMessage event missing space id — dropping');
    await finalizeOperatorEventFailed(event.id, claimToken, 'missing space id for imessage reply');
    return;
  }
  if (!(await operatorBindingStillValid(event, claimToken))) return;
  await runClaimedOperatorTurn(event, claimToken, (reply) =>
    runImessageOperatorTurn({
      organizationId: event.organizationId,
      clerkUserId: event.clerkUserId,
      senderId: event.chatId,
      body: event.body,
      reply,
      turnId: event.id,
    }),
  );
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
  } else if (claimed.channel === 'imessage') {
    await processImessageOperatorEvent(claimed, claimed.claimToken);
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
