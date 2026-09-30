import type { OperatorEvent } from '@prisma/client';
import { db, createMessage } from '@shopkeeper/db';
import {
  finalizeOperatorEventCommitted,
  finalizeOperatorEventFailed,
  markOperatorEventReplyDelivered,
  markOperatorEventReplyDeliveryUnknown,
} from './operator-event-store.js';
import { sendMessage } from './clients/telegram-client.js';
import { sendImessageToSpace } from './clients/spectrum.js';
import { stripMarkdown } from './message-handlers/shared/strip-markdown.js';
import { operatorEventBindingIsCurrent } from './operator-identity.js';

export type OperatorEventReplyDelivery = boolean | 'unknown';

// A phone task has already settled. Persist its confirmation before dispatch;
// the existing event sweep can then recover delivery without executing it again.
export async function completeOperatorTaskReply(input: {
  organizationId: string;
  taskId: string;
  requestId: string;
  summary?: string;
}): Promise<void> {
  const event = await db.operatorEvent.findFirst({
    where: { organizationId: input.organizationId, agentRequestId: input.requestId, status: 'claimed' },
    include: { agentRequest: { include: { task: true } } },
  });
  const task = event?.agentRequest?.task;
  if (!event?.claimToken || !task || task.id !== input.taskId || ['queued', 'running'].includes(task.status)) return;
  if (!(await operatorEventBindingIsCurrent(event))) {
    await finalizeOperatorEventFailed(event.id, event.claimToken, 'binding revoked or reassigned before reply');
    return;
  }

  let response = await db.message.findFirst({
    where: {
      threadId: task.threadId, agentTaskId: task.id, agentRequestId: input.requestId,
      senderType: 'agent', deletedAt: null,
    },
    orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
  });
  const summary = task.cancelledAt
    ? task.status === 'reconciling'
      ? 'Stopped further work. An action had already started and still needs confirmation. Check its outcome before retrying.'
      : 'Stopped. No further work will run for this instruction.'
    : task.status === 'reconciling'
      ? 'I could not confirm the outcome. Check the completed actions before retrying this instruction.'
      : task.status === 'failed'
        ? task.failureCode === 'task_budget_exhausted'
          ? 'This instruction reached its work limit and has stopped. Check completed actions before continuing.'
          : 'I could not finish this instruction. Check completed actions before continuing.'
        : response?.contentText || input.summary || 'I could not finish this instruction. Check completed actions before continuing.';
  if (!response || response.contentText !== summary) {
    response = await createMessage({
      threadId: task.threadId, senderType: 'agent', contentText: summary,
      agentTaskId: task.id, agentRequestId: input.requestId,
    });
  }
  if (!(await finalizeOperatorEventCommitted(event.id, event.claimToken, summary, { replyMessageId: response.id }))) return;
  const delivery = await sendOperatorEventReply(event, summary);
  if (delivery === true) await markOperatorEventReplyDelivered(event.id);
  if (delivery === 'unknown') await markOperatorEventReplyDeliveryUnknown(event.id);
}

// Deliver one operator reply on the event's own channel, returning true when the
// provider accepted it. Used both by the operator-event worker (the live turn's
// reply) and the recovery sweep (re-sending a committed-but-undelivered
// confirmation), so per-channel send formatting lives in one place. The worker
// reconstructs the target from the persisted row — chatId for Telegram, the
// bound space for iMessage — with no request-scoped handle.
export async function sendOperatorEventReply(
  event: OperatorEvent,
  text: string,
): Promise<OperatorEventReplyDelivery> {
  if (event.channel === 'telegram') {
    try {
      return await sendMessage(event.chatId, text, { orgId: event.organizationId });
    } catch {
      return 'unknown';
    }
  }

  if (event.channel === 'imessage') {
    if (!event.spaceId) return false;
    try {
      await sendImessageToSpace(event.spaceId, stripMarkdown(text), { orgId: event.organizationId });
      return true;
    } catch {
      return 'unknown';
    }
  }

  return false;
}
