import { db, findOrgMemberBindToken, looksLikeOrgMemberBindToken } from '@shopkeeper/db';
import logger from '../../logger.js';
import { runOperatorTurn } from '../operator/message-handler.js';
import {
  progressOnlyPresence,
  SILENT_CHANNEL_PROGRESS_THRESHOLD_MS,
  TYPING_INDICATOR_PROGRESS_THRESHOLD_MS,
  type OperatorPresence,
  type OperatorReply,
} from '../operator-message.js';
import { withImessageTyping } from '../../clients/spectrum.js';
import { handleImessageBinding } from './binding.js';

export interface ImessageOperatorInbound {
  senderId: string;
  spaceId: string;
  body: string;
  displayName: string | null;
  reply: OperatorReply;
}

export interface BoundImessageMember {
  organizationId: string;
  clerkUserId: string;
}

// Resolve the sender's binding and perform the synchronous binding maintenance
// (connect-code binding/re-bind, unbound reply, and space/label refresh). Returns
// the bound member when there is an operator turn left to run, or null when the
// message was a binding interaction fully handled here. The webhook runs it
// before enqueueing the turn as a durable operator event.
export async function resolveImessageOperatorBinding(
  message: ImessageOperatorInbound,
): Promise<BoundImessageMember | null> {
  const { senderId, spaceId, body, displayName, reply } = message;

  const binding = await db.orgMemberImessageBinding.findUnique({
    where: { senderId },
    include: { orgMember: true },
  });

  const trimmedBody = body.trim();
  const candidateToken = trimmedBody && !/\s/.test(trimmedBody) ? trimmedBody : null;

  if (!binding) {
    await handleImessageBinding({ senderId, spaceId, body, displayName, reply });
    return null;
  }

  // Re-bind only when the body matches a connect-code shape; skip DB for yes/no/HELP.
  if (candidateToken && looksLikeOrgMemberBindToken(candidateToken)) {
    const resolvedPayload = await findOrgMemberBindToken(candidateToken);
    if (resolvedPayload) {
      await handleImessageBinding({ senderId, spaceId, body, displayName, reply, resolvedPayload });
      return null;
    }
  }

  // Keep the reply space (and label) current so async digests reach the latest space.
  if (binding.spaceId !== spaceId || (displayName && binding.displayName !== displayName)) {
    await db.orgMemberImessageBinding
      .update({ where: { id: binding.id }, data: { spaceId, ...(displayName ? { displayName } : {}) } })
      .catch((err) => logger.warn({ err, bindingId: binding.id }, '[iMessage] Failed to refresh binding'));
  }

  return {
    organizationId: binding.orgMember.organizationId,
    clerkUserId: binding.orgMember.clerkUserId,
  };
}

export interface ImessageOperatorTurnParams {
  organizationId: string;
  clerkUserId: string;
  senderId: string;
  body: string;
  reply: OperatorReply;
  turnId?: string;
  /** Enables the native typing indicator; without it the turn is silent until it answers. */
  spaceId?: string | null;
}

// The native "…" bubble is the acknowledgement whenever it can be raised: it
// lands immediately and is what a person texting actually looks like, so a
// "Working on that…" alongside it is just a second notification saying what the
// merchant can already see. Words are held back for turns long enough that the
// bubble alone reads as a hang.
//
// Without a space there is no bubble to raise, and the words become the only
// acknowledgement the channel has — so they come quickly instead.
export function imessagePresence(reply: OperatorReply, spaceId: string | null | undefined): OperatorPresence {
  if (!spaceId) return progressOnlyPresence(reply, SILENT_CHANNEL_PROGRESS_THRESHOLD_MS);

  const withProgressText = progressOnlyPresence(reply, TYPING_INDICATOR_PROGRESS_THRESHOLD_MS);
  return (progress, work) => withImessageTyping(spaceId, () => withProgressText(progress, work));
}

// The operator turn for one bound iMessage message: keyword fast paths
// (help/summary/digest/pending-plan) then the free-form agent turn. Extracted so
// both the synchronous webhook path and the durable operator-event worker run
// identical logic; they differ only in the injected reply (provider send) and
// when the webhook is acknowledged.
export async function runImessageOperatorTurn(params: ImessageOperatorTurnParams): Promise<void | 'queued'> {
  const { organizationId, clerkUserId, senderId, body, reply, turnId, spaceId } = params;

  return runOperatorTurn(organizationId, clerkUserId, {
    chatId: senderId,
    body,
    reply,
    deliveryRef: `imessage:${senderId}`,
    spaceId,
    ...(turnId ? { turnId } : {}),
    presence: imessagePresence(reply, spaceId),
  });
}
