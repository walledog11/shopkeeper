import { db } from '@shopkeeper/db';
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
import { handleImessageBinding } from './binding.js';

export interface ImessageOperatorInbound {
  integrationId: string;
  organizationId: string;
  senderId: string;
  spaceId: string;
  body: string;
  displayName: string | null;
  reply: OperatorReply;
}

// Operator-channel iMessage dispatch — the iMessage equivalent of
// handleTelegramMessage. The merchant texts the org's dedicated Spectrum line and
// the operator agent replies; no customer ever reaches this path. Reuses the same
// command handlers as Telegram via the channel-neutral OperatorMessageContext.
export async function handleImessageOperatorMessage(message: ImessageOperatorInbound): Promise<void> {
  const { integrationId, organizationId, senderId, spaceId, body, displayName, reply } = message;

  const binding = await db.orgMemberImessageBinding.findUnique({
    where: { integrationId_senderId: { integrationId, senderId } },
    include: { orgMember: true },
  });

  // Unbound sender: the only valid action is to text a connect token.
  if (!binding) {
    await handleImessageBinding({ integrationId, senderId, spaceId, body, displayName, reply });
    return;
  }

  // Keep the reply space (and label) current so async digests reach the latest space.
  if (binding.spaceId !== spaceId || (displayName && binding.displayName !== displayName)) {
    await db.orgMemberImessageBinding
      .update({ where: { id: binding.id }, data: { spaceId, ...(displayName ? { displayName } : {}) } })
      .catch((err) => logger.warn({ err, bindingId: binding.id }, '[iMessage] Failed to refresh binding'));
  }

  const clerkUserId = binding.orgMember.clerkUserId;
  const chatId = senderId;
  const context = await getContext(organizationId, chatId);

  const operatorMessage: OperatorMessageContext = {
    chatId,
    body,
    reply,
    senderRef: `imessage:${senderId}`,
    presence: progressOnlyPresence(reply),
  };

  const command = parseTelegramCommand(body);

  if (command.type === 'help') {
    await reply(HELP_TEXT);
    return;
  }

  if (command.type === 'summary') {
    const digest = await buildOrgDigest(organizationId, new Date());
    if (!digest) {
      await reply('Your support inbox is empty — no open tickets.');
      return;
    }
    await updateContext(organizationId, chatId, { pendingDigest: digest.pendingDigest });
    await reply(digest.message);
    return;
  }

  if (isDigestCommand(command) && await handleDigestCommand(organizationId, command, context, operatorMessage)) {
    return;
  }

  if (
    isPendingPlanCommand(command)
    && await handlePendingPlanCommand(organizationId, clerkUserId, operatorMessage, command, context)
  ) {
    return;
  }

  if (
    command.type === 'order-lookup'
    && await handleOrderLookup(organizationId, chatId, command.orderNumber, reply)
  ) {
    return;
  }

  if (
    command.type === 'free-form'
    && await handlePendingQuestionAnswer(organizationId, operatorMessage, context)
  ) {
    return;
  }

  await executeFreeFormInstruction(organizationId, clerkUserId, operatorMessage, context);
}
