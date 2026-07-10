import { db } from '@shopkeeper/db';
import logger from '../../logger.js';
import { buildOrgDigest } from '../../maintenance/digest.js';
import { getContext, updateContext } from '../../operator-context.js';
import { executeFreeFormInstruction, handleOrderLookup } from './agent-execution.js';
import {
  isDigestCommand,
  isPendingPlanCommand,
  parseTelegramCommand,
} from './command-parser.js';
import { handleDigestCommand } from './digest-commands.js';
import { HELP_TEXT } from './format.js';
import { handlePendingPlanCommand } from './pending-plan-commands.js';
import { handlePendingQuestionAnswer } from './pending-question-commands.js';
import { handleStartBinding } from './start-binding.js';
import { withOperatorPresence } from './presence.js';
import { buildMirroredReply } from '../../operator-thread-mirror.js';
import type { TelegramMessageContext } from './types.js';
import type { OperatorMessageContext } from '../operator-message.js';

export async function handleTelegramMessage(
  message: TelegramMessageContext & { body: string },
): Promise<void> {
  const { chatId, body, reply } = message;
  const command = parseTelegramCommand(body);
  if (command.type === 'start') {
    await handleStartBinding(chatId, command.token, message.metadata, reply);
    return;
  }

  const chat = await db.orgMemberTelegramChat.findUnique({
    where: { chatId },
    include: { orgMember: true },
  });
  const member = chat?.orgMember ?? null;
  if (!member) {
    logger.warn({ chatId }, '[Telegram] Unbound sender');
    await reply(
      "This chat isn't connected to a Shopkeeper workspace. Generate a link from your Shopkeeper dashboard under Integrations → Telegram.",
    );
    return;
  }

  const { organizationId, clerkUserId } = member;
  const operatorKey = `telegram:${chatId}`;
  const context = await getContext(organizationId, chatId);

  // Freeform turns persist their own thread messages, so they keep the raw reply.
  // Command paths reply through a wrapper that mirrors the exchange (inbound once,
  // then each reply) onto the merchant's durable operator thread.
  const baseMessage: OperatorMessageContext = {
    chatId,
    body,
    reply,
    senderRef: operatorKey,
    presence: (progress, work) =>
      withOperatorPresence({ chatId, messageId: message.messageId, reply, progress }, work),
  };
  const mirroredReply = buildMirroredReply(organizationId, operatorKey, body, reply);
  const commandMessage: OperatorMessageContext = { ...baseMessage, reply: mirroredReply };

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
