import { db, findOrgMemberBindToken, looksLikeOrgMemberBindToken } from '@shopkeeper/db';
import logger from '../../logger.js';
import { buildOrgDigest } from '../../maintenance/digest.js';
import { getContext, updateContext } from '../../operator-context.js';
import { executeFreeFormInstruction } from '../telegram/agent-execution.js';
import { isDigestCommand, isPendingPlanCommand, parseTelegramCommand } from '../telegram/command-parser.js';
import { handleDigestCommand } from '../telegram/digest-commands.js';
import { HELP_TEXT } from '../telegram/format.js';
import { handlePendingPlanCommand } from '../telegram/pending-plan-commands.js';
import { progressOnlyPresence, type OperatorMessageContext, type OperatorReply } from '../operator-message.js';
import { buildMirroredReply } from '../../operator-thread-mirror.js';
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

// Reply-free binding resolution by sender handle. The durable (P4-03) worker
// re-runs this at claim time to re-validate ownership before running a turn; it
// never mutates the binding or replies.
export async function resolveBoundImessageMember(senderId: string): Promise<BoundImessageMember | null> {
  const binding = await db.orgMemberImessageBinding.findUnique({
    where: { senderId },
    include: { orgMember: true },
  });
  if (!binding) return null;
  return {
    organizationId: binding.orgMember.organizationId,
    clerkUserId: binding.orgMember.clerkUserId,
  };
}

// Resolve the sender's binding and perform the synchronous binding maintenance
// (connect-code binding/re-bind, unbound reply, and space/label refresh). Returns
// the bound member when there is an operator turn left to run, or null when the
// message was a binding interaction fully handled here. Both the synchronous
// handler and the durable webhook ingestion path share this so binding behavior
// stays identical; only where the turn runs differs.
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
}

// The operator turn for one bound iMessage message: keyword fast paths
// (help/summary/digest/pending-plan) then the free-form agent turn. Extracted so
// both the synchronous webhook path and the durable operator-event worker run
// identical logic; they differ only in the injected reply (provider send) and
// when the webhook is acknowledged. Mirrors runTelegramOperatorTurn.
export async function runImessageOperatorTurn(params: ImessageOperatorTurnParams): Promise<void> {
  const { organizationId, clerkUserId, senderId, body, reply, turnId } = params;

  const chatId = senderId;
  const operatorKey = `imessage:${senderId}`;
  const context = await getContext(organizationId, chatId);

  // Freeform turns persist their own thread messages, so they keep the raw reply.
  // Command paths reply through a wrapper that mirrors the exchange (inbound once,
  // then each reply) onto the merchant's durable operator thread.
  const baseMessage: OperatorMessageContext = {
    chatId,
    body,
    reply,
    senderRef: operatorKey,
    ...(turnId ? { turnId } : {}),
    presence: progressOnlyPresence(reply),
  };
  const mirroredReply = buildMirroredReply(organizationId, operatorKey, body, reply);
  const commandMessage: OperatorMessageContext = { ...baseMessage, reply: mirroredReply };

  const command = parseTelegramCommand(body);

  if (command.type === 'help') {
    await mirroredReply(HELP_TEXT);
    return;
  }

  if (command.type === 'summary') {
    const digest = await buildOrgDigest(organizationId, new Date());
    if (!digest) {
      await mirroredReply('Your support inbox is empty — no open tickets.');
      return;
    }
    await updateContext(organizationId, chatId, { pendingDigest: digest.pendingDigest });
    await mirroredReply(digest.message);
    return;
  }

  if (isDigestCommand(command) && await handleDigestCommand(organizationId, command, context, commandMessage)) {
    return;
  }

  if (
    isPendingPlanCommand(command)
    && await handlePendingPlanCommand(organizationId, clerkUserId, commandMessage, command, context)
  ) {
    return;
  }

  // Everything past the keyword fast path is one agent turn: the model reads the
  // pending-state ledger and drives approve/reject/revise/answer via control tools,
  // or handles a fresh instruction normally.
  await executeFreeFormInstruction(organizationId, clerkUserId, baseMessage, context);
}

// Synchronous operator-channel iMessage dispatch — the iMessage equivalent of
// handleTelegramMessage, and the fallback path when the durable operator queue is
// off for iMessage. Resolves/maintains the binding, then runs the turn inline.
export async function handleImessageOperatorMessage(message: ImessageOperatorInbound): Promise<void> {
  const member = await resolveImessageOperatorBinding(message);
  if (!member) return;

  await runImessageOperatorTurn({
    organizationId: member.organizationId,
    clerkUserId: member.clerkUserId,
    senderId: message.senderId,
    body: message.body,
    reply: message.reply,
  });
}
