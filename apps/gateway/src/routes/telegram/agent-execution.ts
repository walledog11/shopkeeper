import { randomUUID } from 'node:crypto';
import { acceptMemberAgentRequest } from '@shopkeeper/agent/task-ledger';
import { resolveOperatorThread } from '@shopkeeper/agent/internal-thread';
import logger from '../../logger.js';
import { ensureAgentTaskEnqueued, memberAgentTaskBudget } from '../../agent-task-ingest.js';
import { claimOperatorEvent, ingestOperatorEvent, finalizeOperatorEventFailed } from '../../operator-event-store.js';
import type { OperatorEvent } from '@prisma/client';
import type { OperatorMessageContext } from '../operator-message.js';

// The event owns inbound dedupe and phone delivery; the existing task worker
// owns execution, budget and stop. No model work runs in this transport wrapper.
export async function executeFreeFormInstruction(
  organizationId: string,
  clerkUserId: string,
  message: OperatorMessageContext,
): Promise<void | 'queued'> {
  const { chatId, reply } = message;
  logger.info({ chatId, organizationId }, '[Operator] Free-form agent instruction');

  let fallbackEvent: OperatorEvent | null = null;
  try {
    let eventId = message.turnId;
    if (!eventId) {
      // The provider omitted an inbound id. Give this accepted occurrence the
      // same event lifecycle; there is no stable provider key to deduplicate it.
      const channel = message.deliveryRef?.startsWith('imessage:') ? 'imessage' : 'telegram';
      const { event } = await ingestOperatorEvent({
        organizationId, clerkUserId, channel, chatId,
        providerMessageId: `local:${randomUUID()}`,
        operatorKey: message.senderRef,
        body: message.body,
        ...(message.spaceId ? { spaceId: message.spaceId } : {}),
      });
      fallbackEvent = await claimOperatorEvent(event.id);
      if (!fallbackEvent) throw new Error('Operator event could not be claimed.');
      eventId = event.id;
    }
    const thread = await resolveOperatorThread(organizationId, message.senderRef);
    const accepted = await acceptMemberAgentRequest({
      organizationId,
      clerkUserId,
      threadId: thread.id,
      instruction: message.body,
      dedupeKey: `operator-event:${eventId}`,
      sourceOperatorEventId: eventId,
      budget: memberAgentTaskBudget(organizationId),
    });
    if (!accepted.task) throw new Error('Accepted phone request has no task.');
    try {
      if (accepted.task.status === 'queued') await ensureAgentTaskEnqueued(accepted.task);
    } catch (err) {
      // The committed task remains queued. The task sweep heals an enqueue gap
      // without asking the merchant to send the instruction a second time.
      logger.error({ err, taskId: accepted.task.id }, '[Operator] Task enqueue failed');
    }
    return 'queued';
  } catch (err) {
    logger.error({ err }, '[Operator] Operator agent turn failed (free-form)');
    if (fallbackEvent?.claimToken) {
      await finalizeOperatorEventFailed(fallbackEvent.id, fallbackEvent.claimToken, 'request acceptance failed');
    }
    await reply('Something went wrong running the agent. Please try again.');
    return;
  }
}
