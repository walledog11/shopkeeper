import { db, findOrgMemberBindToken, looksLikeOrgMemberBindToken } from '@shopkeeper/db';
import logger from '../../logger.js';
import { buildOrgDigest } from '../../maintenance/digest.js';
import { getContext, updateContext } from '../../operator-context.js';
import { executeFreeFormInstruction, handleOrderLookup } from '../telegram/agent-execution.js';
import { isDigestCommand, isPendingPlanCommand, parseTelegramCommand } from '../telegram/command-parser.js';
import { handleDigestCommand } from '../telegram/digest-commands.js';
import { HELP_TEXT } from '../telegram/format.js';
import { handlePendingPlanCommand } from '../telegram/pending-plan-commands.js';
import { handlePendingQuestionAnswer } from '../telegram/pending-question-commands.js';
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

// Operator-channel iMessage dispatch — the iMessage equivalent of
// handleTelegramMessage. The merchant texts Shopkeeper's platform Spectrum line
// and the operator agent replies; no customer ever reaches this path. The sender
// binding resolves which org the handle belongs to. Reuses the same command
// handlers as Telegram via the channel-neutral OperatorMessageContext.
export async function handleImessageOperatorMessage(message: ImessageOperatorInbound): Promise<void> {
  const { senderId, spaceId, body, displayName, reply } = message;

  const binding = await db.orgMemberImessageBinding.findUnique({
    where: { senderId },
    include: { orgMember: true },
  });

  const trimmedBody = body.trim();
  const candidateToken = trimmedBody && !/\s/.test(trimmedBody) ? trimmedBody : null;

  if (!binding) {
    await handleImessageBinding({ senderId, spaceId, body, displayName, reply });
    return;
  }

  // Re-bind only when the body matches a connect-code shape; skip DB for yes/no/HELP.
  if (candidateToken && looksLikeOrgMemberBindToken(candidateToken)) {
    const resolvedPayload = await findOrgMemberBindToken(candidateToken);
    if (resolvedPayload) {
      await handleImessageBinding({ senderId, spaceId, body, displayName, reply, resolvedPayload });
      return;
    }
  }

  // Keep the reply space (and label) current so async digests reach the latest space.
  if (binding.spaceId !== spaceId || (displayName && binding.displayName !== displayName)) {
    await db.orgMemberImessageBinding
      .update({ where: { id: binding.id }, data: { spaceId, ...(displayName ? { displayName } : {}) } })
      .catch((err) => logger.warn({ err, bindingId: binding.id }, '[iMessage] Failed to refresh binding'));
  }

  const organizationId = binding.orgMember.organizationId;
  const clerkUserId = binding.orgMember.clerkUserId;
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

  if (
    command.type === 'order-lookup'
    && await handleOrderLookup(organizationId, chatId, command.orderNumber, mirroredReply)
  ) {
    return;
  }

  if (
    command.type === 'free-form'
    && await handlePendingQuestionAnswer(organizationId, commandMessage, context)
  ) {
    return;
  }

  await executeFreeFormInstruction(organizationId, clerkUserId, baseMessage);
}
